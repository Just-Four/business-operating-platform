"use client";

import { useState } from "react";
import { COUNTRIES } from "@/lib/countries";

export default function CountryCurrency({ defaultCountry = "United Kingdom" }: { defaultCountry?: string }) {
  const initial = COUNTRIES.find((c) => c.name === defaultCountry)?.currency ?? "GBP";
  const [currency, setCurrency] = useState(initial);
  const currencies = Array.from(new Set(COUNTRIES.map((c) => c.currency))).sort();

  return (
    <>
      <div>
        <label className="label" htmlFor="country">Country</label>
        <select
          className="input"
          id="country"
          name="country"
          defaultValue={defaultCountry}
          autoComplete="off"
          onChange={(e) => {
            const match = COUNTRIES.find((c) => c.name === e.target.value);
            if (match) setCurrency(match.currency);
          }}
        >
          {COUNTRIES.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="currency">Currency</label>
        <select className="input" id="currency" name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {currencies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
