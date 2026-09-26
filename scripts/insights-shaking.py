"""
Adds `pereira` to `src/insights/durations.json`: how long the M7.4 shook at SGC's accelerometer in
Pereira, for the story's "¿Cuánto duró?" step. Run once, by hand, and commit the output.

It reads two files the repo owner downloads from SGC's open FDSN service (the agent does not make
requests to SGC hosts, see CLAUDE.md), one request each:

  curl -sS "http://sismo.sgc.gov.co:8080/fdsnws/station/1/query?network=CM&latitude=4.8133&longitude=-75.6961&maxradius=0.6&starttime=2026-08-10T12:00:00&endtime=2026-08-10T13:00:00&level=channel&format=text" -o stations.txt
  curl -sS "http://sismo.sgc.gov.co:8080/fdsnws/dataselect/1/query?network=CM&station=CPER4,CBOCA&location=10&channel=HN?&starttime=2026-08-10T12:33:30&endtime=2026-08-10T12:41:00" -o m74.mseed

then, with a Python that has ObsPy (`pip install obspy`):

  python scripts/insights-shaking.py m74.mseed stations.txt && pnpm format

CPER4, 3 km from the page's Pereira point, has no data for the M7.4 in SGC's archive; CBOCA, 6.6 km
away, does, and is what the step uses. The figures are in seconds from 12:34:28 UTC, the hypocentral
time of USGS's finite-fault model (`eventtime` of us6000tjl2_1), because the step draws them on one
clock with that model's rupture; SGC's catalogue gives 12:34:27. On the two horizontal components
together, after removing the pre-event mean, a linear trend and everything below 0.1 Hz:
- `arrivalS` and `recordedToS`: the first and last 1-s window whose RMS exceeds 100 times the
  pre-event noise (the first 40 s of the file), so where the sensor clearly records the earthquake.
- `strongFromS` and `strongToS`: 5% and 95% of the Arias intensity, the significant duration D5-95
  (Trifunac & Brady 1975). It is a ratio, so it does not depend on the sensor's calibration.
- `peakS`: the 1-s window with the largest RMS.
The peak acceleration (0.018 g with the published sensitivity) is not written: it sits far below the
intensity USGS reports for Pereira, and the calibration could not be checked (docs/science.md).
"""

import json
from datetime import date
import math
import sys
from pathlib import Path

import numpy as np
from obspy import UTCDateTime, read

OUT = Path(__file__).resolve().parent.parent / "src" / "insights" / "durations.json"
# USGS's finite-fault model's hypocentral time: the zero of the fault bar the Pereira bar is drawn beside.
ORIGIN = UTCDateTime("2026-08-10T12:34:28")
STATION = "CBOCA"
PEREIRA = (4.8133, -75.6961)  # core/places.ts
NOISE_S = 40
NOISE_FACTOR = 100


def station_coords(path: str):
    for line in open(path):
        if line.startswith("#"):
            continue
        f = line.rstrip("\n").split("|")
        # Location 10, and the epoch that covers the earthquake (an empty end is still open).
        if f[1] == STATION and f[2] == "10" and f[3].startswith("HN"):
            if UTCDateTime(f[15]) <= ORIGIN and (not f[16] or UTCDateTime(f[16]) >= ORIGIN):
                return float(f[4]), float(f[5])
    raise SystemExit(f"{STATION} is not in {path}")


def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (*a, *b))
    c = math.sin(la1) * math.sin(la2) + math.cos(la1) * math.cos(la2) * math.cos(lo2 - lo1)
    return 6371.0 * math.acos(min(1.0, c))


mseed, stations = sys.argv[1], sys.argv[2]
st = read(mseed).select(station=STATION, location="10", channel="HN[EN]")
# One unbroken trace per component: filling a gap would add a step the size of the sensor's offset
# (~470,000 counts) and drive every figure below.
if sorted(tr.stats.channel for tr in st) != ["HNE", "HNN"]:
    raise SystemExit(f"expected one unbroken trace per horizontal component of {STATION}, got {st}")
start = max(tr.stats.starttime for tr in st)
st.trim(start, min(tr.stats.endtime for tr in st))
sr = int(st[0].stats.sampling_rate)
noise_n = NOISE_S * sr
for tr in st:
    # The sensor's constant offset first, then the usual trend and low-frequency drift.
    tr.data = tr.data.astype(float) - tr.data[:noise_n].mean()
    tr.detrend("linear")
    tr.taper(0.02)
    tr.filter("highpass", freq=0.1, corners=4, zerophase=True)
h = [tr.data for tr in st]
n = min(len(x) for x in h)
e = h[0][:n] ** 2 + h[1][:n] ** 2
t = np.arange(n) / sr + (start - ORIGIN)

arias = np.cumsum(e)
arias /= arias[-1]
strong_from = t[np.searchsorted(arias, 0.05)]
strong_to = t[np.searchsorted(arias, 0.95)]

m = n // sr
env = np.sqrt(e[: m * sr].reshape(m, sr).mean(axis=1))
te = t[::sr][:m]
noise = np.median(env[:NOISE_S])
over = np.nonzero(env >= NOISE_FACTOR * noise)[0]

lat, lon = station_coords(stations)
pereira = {
    "network": "CM",
    "station": STATION,
    "location": "10",
    "lat": lat,
    "lon": lon,
    "kmFromPereira": round(km(PEREIRA, (lat, lon)), 1),
    # The day the recording was downloaded, from the file itself.
    "retrieved": date.fromtimestamp(Path(mseed).stat().st_mtime).isoformat(),
    "arrivalS": round(float(te[over[0]]), 1),
    "strongFromS": round(float(strong_from), 1),
    "strongToS": round(float(strong_to), 1),
    "peakS": round(float(te[np.argmax(env)]), 1),
    "recordedToS": round(float(te[over[-1]]), 1),
}
data = json.loads(OUT.read_text())
data["pereira"] = pereira
OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
print(json.dumps(pereira))
