// RESEARCH. filmstrip.mjs DIR OUT: copies, for t = 0, 100, … 1000 ms, the last of nav-timing.mjs' frames
// at or before t into OUT as f00.jpg…; then tile with
//   ffmpeg -i OUT/f%02d.jpg -filter_complex "scale=206:-1,tile=11x1:padding=4:color=white" -frames:v 1 strip.png
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
const [dir, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const frames = readdirSync(dir)
  .filter((f) => f.endsWith(".jpg"))
  .map((f) => ({ f, t: Number(f.split("_")[1].replace("ms.jpg", "")) }))
  .sort((a, b) => a.t - b.t);
for (let i = 0; i <= 10; i++) {
  const t = i * 100;
  const pick = frames.filter((x) => x.t <= t).at(-1) ?? frames[0];
  copyFileSync(`${dir}/${pick.f}`, `${out}/f${String(i).padStart(2, "0")}.jpg`);
}
