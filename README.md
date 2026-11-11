# Which car should I buy?

A free, open-source calculator for Pakistan that turns every car-buying option into **one true monthly cost**: fuel or charging, depreciation, taxes, insurance, financing, upkeep and what your money could have earned if invested instead.

Compare up to five options side by side:

- **Petrol, hybrid, plug-in hybrid (PHEV) and electric** cars, from presets or your own numbers
- **Cash vs EMI / Ijarah**, with SBP auto-finance rule checks
- **Ride-hailing** (car, economy, bike) instead of owning
- **Keep your current car** vs selling it, including a big repair or hybrid battery you expect

## What you get

- A plain-language verdict, including the **break-even km a day** where the winner changes
- True monthly cost, cost per km, pay-today amount, EMI and resale for each option
- Chart: where the money goes each month (stacked by cause)
- Chart: monthly cost at every daily distance, so you can see where lines cross
- Chart: money gone if you stopped at any point (sold the car, settled the loan)
- A full breakdown table and "check before you sign" warnings
- Share link (state is encoded in the URL) and auto-save in your browser

## How it works

All maths is in [`assets/calc.js`](assets/calc.js), plain JavaScript with no dependencies. Each option is simulated month by month. The true monthly cost is the level monthly amount whose invested future value equals the invested future value of every rupee the option takes, minus the resale you get back. Details are in the "How the numbers are worked out" section of the page.

## Updating prices

Edit [`data/presets.json`](data/presets.json). Each car has its price, km/l or km/kWh, yearly depreciation, upkeep, token tax and filer withholding tax, plus a `source` and `note`. Fields marked as estimates in `note` should be verified. Fuel price and KIBOR defaults sit under `defaults`.

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

(Opening `index.html` directly won't load the presets, because browsers block `fetch` from `file://`.)

## Tests

```bash
node tests/calc.test.js
```

## Roadmap ideas

- Motorcycles and e-scooters (70cc, 125cc, lead-acid vs lithium, battery swap)
- Used cars with age-based depreciation curves
- Peak / off-peak electricity tariffs and load-shedding effect on charging
- Weighted non-money scoring: safety, seats, ground clearance, parts availability
- "Best year to sell" and "repair vs replace" calculators

---

For education only. Not financial advice. Prices, taxes and finance rules change often; confirm with your dealer and bank.
