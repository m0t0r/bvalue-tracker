import { useForm, useStore } from "@tanstack/react-form";
import { RotateCcwIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { InfoTip } from "@/components/info-tip";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { defaultFilters, type Filters } from "@/lib/filters";
import { useI18n } from "@/lib/i18n";
import { useZone } from "@/lib/zone";

interface Props {
  mcAuto: number | null;
  /** The page's filters. The form renders these; it does not own them. */
  value: Filters;
  onChange: (f: Filters) => void;
  /** Whether the zone has a detected mainshock for "Excluir sismo principal" to leave out. */
  hasMainshock: boolean;
}

export function FiltersCard({ mcAuto, value, onChange, hasMainshock }: Props) {
  const { t } = useI18n();
  const zone = useZone();
  const form = useForm({
    defaultValues: value,
    validators: {
      onChange: ({ value }) => (value.from && value.to && value.from > value.to ? t.dateOrder : undefined),
    },
  });

  const values = useStore(form.store, (s) => s.values);
  const formError = useStore(form.store, (s) => s.errors[0]);

  /**
   * The page is the owner: "Quitar filtros" on the scope bar sets `value`, and the form takes it.
   *
   * The two effects are a loop unless the form can tell the page's own echo from a real change, so
   * it remembers the last object it handed up and compares by identity. That is exact, and it is
   * also what keeps a half-typed date safe: while the form is invalid nothing is emitted, `value`
   * stays the last good object, and the reader's `from > to` is not reset out from under them.
   *
   * Order matters. This effect is declared first so that in the commit where the reader changed a
   * field it still sees the value it emitted last, and does not reset the form to it.
   */
  const emitted = useRef(value);
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    form.reset(value);
  }, [value, form]);
  useEffect(() => {
    if (formError) return;
    emitted.current = values;
    onChange(values);
  }, [values, formError, onChange]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.filters}</CardTitle>
        <CardAction>
          {/* Asked of the page, like every other change here, so that clearing from the card and
              clearing from the scope bar are the same event and cannot drift apart. */}
          <Button variant="ghost" size="sm-touch" onClick={() => onChange(defaultFilters(zone.id))}>
            <RotateCcwIcon data-icon="inline-start" />
            {t.reset}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {/* No <form>: nothing here is submitted, every change applies as it is made. Inside a form Radix
            adds a hidden input per slider and switch, which DevTools reports as fields with no label. */}
        {/* Three groups, one column each from `lg`: when (the dates), which events (the smallest
            magnitude and the two switches), and the Mc the b-value is fitted above, which moves
            the figures and selects nothing. Stacked on a phone in the same order. */}
        <FieldGroup className="grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Each date's label sits beside it, so the pair reads as one range; the shared columns
              line both inputs up whatever the labels' widths ("From" / "To"). The space between
              label and input is Field's own gap, which a subgrid keeps over its parent's. */}
          <div className="grid grid-cols-[auto_1fr] content-start items-center gap-y-2">
            <form.Field name="from">
              {(field) => (
                <Field data-invalid={!!formError} className="col-span-2 grid grid-cols-subgrid items-center">
                  <FieldLabel htmlFor={field.name}>{t.from}</FieldLabel>
                  <Input
                    id={field.name}
                    type="date"
                    min="2018-03-01"
                    aria-invalid={!!formError}
                    aria-describedby={formError ? "date-error" : undefined}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </Field>
              )}
            </form.Field>
            <form.Field name="to">
              {(field) => (
                <Field data-invalid={!!formError} className="col-span-2 grid grid-cols-subgrid items-center">
                  <FieldLabel htmlFor={field.name}>{t.to}</FieldLabel>
                  <Input
                    id={field.name}
                    type="date"
                    aria-invalid={!!formError}
                    aria-describedby={formError ? "date-error" : undefined}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </Field>
              )}
            </form.Field>
            {formError ? (
              <FieldError id="date-error" className="col-span-2">
                {String(formError)}
              </FieldError>
            ) : null}
          </div>
          <div className="flex flex-col gap-3">
            <form.Field name="minMag">
              {(field) => (
                <Field>
                  <FieldLabel id="minMag-label">
                    {t.minMag}: <span>M{field.state.value.toFixed(1)}</span>
                  </FieldLabel>
                  <Slider
                    aria-labelledby="minMag-label"
                    aria-valuetext={`M${field.state.value.toFixed(1)}`}
                    min={0}
                    max={5}
                    step={0.1}
                    value={[field.state.value]}
                    onValueChange={([v]) => field.handleChange(v ?? 0)}
                  />
                </Field>
              )}
            </form.Field>
            <form.Field name="manualOnly">
              {(field) => (
                <Field orientation="horizontal">
                  <Switch id={field.name} checked={field.state.value} onCheckedChange={field.handleChange} />
                  <FieldLabel htmlFor={field.name}>{t.manualOnly}</FieldLabel>
                </Field>
              )}
            </form.Field>
            {/* With no mainshock detected there is nothing for this switch to exclude. */}
            {!hasMainshock ? null : (
              <form.Field name="excludeMainshock">
                {(field) => (
                  <Field orientation="horizontal">
                    <Switch id={field.name} checked={field.state.value} onCheckedChange={field.handleChange} />
                    <FieldLabel htmlFor={field.name}>{t.excludeMainshock}</FieldLabel>
                  </Field>
                )}
              </form.Field>
            )}
          </div>
          <form.Field name="mc">
            {(field) => {
              const manual = field.state.value !== null;
              const shown = field.state.value ?? mcAuto ?? 2.3;
              return (
                <Field>
                  <FieldLabel id="mc-label">
                    {t.mcLabel}: <span>{shown.toFixed(1)}</span>
                  </FieldLabel>
                  <Slider
                    aria-labelledby="mc-label"
                    aria-valuetext={shown.toFixed(1)}
                    min={2}
                    max={4}
                    step={0.1}
                    value={[shown]}
                    onValueChange={([v]) => field.handleChange(v ?? null)}
                  />
                  {/* Why the automatic Mc uses this method sits in a tip beside the method's
                      name: four lines of it under the slider left the other columns empty. */}
                  {/* One line in both states, the state first: "Automática (curvatura máxima)" or
                      "Manual · Usar la Mc automática", the link in the line's own type. */}
                  <FieldDescription>
                    {manual ? (
                      <>
                        {t.mcManual}
                        {" · "}
                        <Button
                          type="button"
                          variant="link-inline"
                          size="inline"
                          onClick={() => field.handleChange(null)}
                        >
                          {t.mcBackToAuto}
                        </Button>
                      </>
                    ) : (
                      t.mcAuto
                    )}
                    <InfoTip label={t.mcHelpLabel}>{t.mcHelp}</InfoTip>
                  </FieldDescription>
                </Field>
              );
            }}
          </form.Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
