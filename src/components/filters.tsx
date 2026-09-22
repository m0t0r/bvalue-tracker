import { useForm, useStore } from "@tanstack/react-form";
import { RotateCcwIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_FILTERS, type Filters } from "@/lib/filters";
import { useI18n } from "@/lib/i18n";

interface Props {
  mcAuto: number | null;
  /** The page's filters. The form renders these; it does not own them. */
  value: Filters;
  onChange: (f: Filters) => void;
}

export function FiltersCard({ mcAuto, value, onChange }: Props) {
  const { t } = useI18n();
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
          <Button variant="ghost" size="sm" onClick={() => onChange(DEFAULT_FILTERS)}>
            <RotateCcwIcon data-icon="inline-start" />
            {t.reset}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => e.preventDefault()}>
          <FieldGroup className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <form.Field name="from">
              {(field) => (
                <Field data-invalid={!!formError}>
                  <FieldLabel htmlFor={field.name}>{t.from}</FieldLabel>
                  <Input id={field.name} type="date" min="2018-03-01" aria-invalid={!!formError}
                    aria-describedby={formError ? "date-error" : undefined}
                    value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
                  {formError ? <FieldError id="date-error">{String(formError)}</FieldError> : null}
                </Field>
              )}
            </form.Field>
            <form.Field name="to">
              {(field) => (
                <Field data-invalid={!!formError}>
                  <FieldLabel htmlFor={field.name}>{t.to}</FieldLabel>
                  <Input id={field.name} type="date" aria-invalid={!!formError}
                    aria-describedby={formError ? "date-error" : undefined}
                    value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
                </Field>
              )}
            </form.Field>
            <form.Field name="minMag">
              {(field) => (
                <Field>
                  <FieldLabel id="minMag-label">
                    {t.minMag}: <span>M{field.state.value.toFixed(1)}</span>
                  </FieldLabel>
                  <Slider aria-labelledby="minMag-label" aria-valuetext={`M${field.state.value.toFixed(1)}`}
                    min={0} max={5} step={0.1} value={[field.state.value]}
                    onValueChange={([v]) => field.handleChange(v ?? 0)} />
                </Field>
              )}
            </form.Field>
            <form.Field name="mc">
              {(field) => {
                const manual = field.state.value !== null;
                const shown = field.state.value ?? mcAuto ?? 2.3;
                return (
                  <Field>
                    <FieldLabel id="mc-label">
                      {t.mcLabel}: <span>{shown.toFixed(1)}</span>
                    </FieldLabel>
                    <Slider aria-labelledby="mc-label" aria-valuetext={shown.toFixed(1)}
                      min={2} max={4} step={0.1} value={[shown]}
                      onValueChange={([v]) => field.handleChange(v ?? null)} />
                    <FieldDescription>
                      {manual ? (
                        <Button type="button" variant="link" size="inline" onClick={() => field.handleChange(null)}>
                          {t.mcBackToAuto}
                        </Button>
                      ) : t.mcAuto}
                    </FieldDescription>
                  </Field>
                );
              }}
            </form.Field>
            <p className="max-w-[75ch] text-sm text-pretty text-muted-foreground sm:col-span-2 lg:col-span-4">{t.mcHelp}</p>
            <form.Field name="manualOnly">
              {(field) => (
                <Field orientation="horizontal">
                  <Switch id={field.name} checked={field.state.value} onCheckedChange={field.handleChange} />
                  <FieldLabel htmlFor={field.name}>{t.manualOnly}</FieldLabel>
                </Field>
              )}
            </form.Field>
            <form.Field name="excludeMainshock">
              {(field) => (
                <Field orientation="horizontal">
                  <Switch id={field.name} checked={field.state.value} onCheckedChange={field.handleChange} />
                  <FieldLabel htmlFor={field.name}>{t.excludeMainshock}</FieldLabel>
                </Field>
              )}
            </form.Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
