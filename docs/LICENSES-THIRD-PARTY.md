# Third-party data, images, software and licences

Project code: MIT (see `LICENSE`). Every external resource the project uses is listed below. Detailed provenance (exact query URLs, modifications, NCEI citation) is in `docs/research/ASSETS_AND_LICENSES.md`.

## Data

| Resource | Used for | Licence |
|---|---|---|
| NOAA NCEI **GHCN-Daily**, stations USW00023047 (Amarillo), USW00023042 (Lubbock), USW00013985 (Dodge City), USW00023064 (Garden City), 2023–2025 | Arrival-week weather features | Public domain (U.S. Government work). Cite: Menne et al. (2012), doi:10.7289/V5D21VHZ |
| USDA ERS **Livestock and Meat Domestic Data**, livestock-prices.xlsx | "USDA ERS Oct-2025" price preset | Public domain (U.S. Government work) |
| US Census cartographic boundaries via **us-atlas 3.0.1** | Map outlines | us-atlas: ISC; Census data: public domain |
| Literature supplied with the challenge (Rojas 2022; Weber 2024; Johnson & Pendell 2017; NAHMS 2019; Adekunle & Kaniyamattam 2026; Adekunle et al. 2026) | Parameter values (cited, not redistributed) | Facts and short quotations cited for research; the PDFs are not included in this repository |

## Images (`public/images/`): all public domain, U.S. Department of Agriculture

| File | Credit | Source |
|---|---|---|
| feedlot-hero.jpg | USDA photo by Preston Keres | https://commons.wikimedia.org/wiki/File:Cattle_in_Canyon,_Texas_(9383).jpg |
| cattle-in-pens.jpg | USDA photo by Preston Keres | https://commons.wikimedia.org/wiki/File:Cattle_in_Canyon,_Texas_(9382).jpg |
| pen-riders.jpg | USDA photo by Preston Keres | https://commons.wikimedia.org/wiki/File:AMS_Training_at_West_Texas_A%26M_University_(20220923-AMS-PJK-1020).jpg |
| feed-bunk-truck.jpg | USDA photo by Preston Keres | https://commons.wikimedia.org/wiki/File:AMS_Training_at_West_Texas_A%26M_University_(20220923-AMS-PJK-1079).jpg |
| cattle-trailer-arrival.jpg | USDA photo by Lance Cheung | https://commons.wikimedia.org/wiki/File:Douglas,_Arizona_-_Agua_Prieta,_Mexico_port_of_entry_on_August_24,_2026,_to_mark_the_port%E2%80%99s_reopening_to_cattle_imports_from_Mexico_-_34.jpg |
| veterinarian-chute.jpg | USDA APHIS photo by R. Anson Eaglin | https://commons.wikimedia.org/wiki/File:11VS03-12_(34484069454).jpg |

Licence tag: PD-USGov-USDA (17 U.S.C. § 105). Modification: resized to 1600 px width, re-encoded JPEG q82, metadata stripped. Use does not imply endorsement by USDA or any person pictured.

## Software (runtime and build)

| Package | Version | Licence |
|---|---|---|
| react, react-dom | 19.3.1 | MIT |
| react-router-dom | 7.18.5 | MIT |
| zustand | 5.1.0 | MIT |
| recharts | 3.10.1 | MIT |
| d3-geo, d3-scale, d3-shape, d3-array | 3.x / 4.x | ISC |
| topojson-client | 3.1.0 | ISC |
| us-atlas | 3.0.1 | ISC |
| papaparse | 5.7.1 | MIT |
| lucide-react | 1.72.0 | ISC |
| framer-motion | 14.14.0 | MIT |
| clsx | 2.1.1 | MIT |
| @fontsource-variable/inter, @fontsource-variable/jetbrains-mono, @fontsource/fraunces | 5.3.0 | SIL Open Font License 1.1 |
| vite | 8.3.8 | MIT |
| tailwindcss, @tailwindcss/vite | 4.3.5 | MIT |
| typescript | 7.0.2 | Apache-2.0 |
| tsx, vitest | 4.23 / 5.1 | MIT |

Exact resolved versions: `package-lock.json`.

## AI tools

Developed with assistance from Anthropic's Claude (Claude Code) for code, synthetic-data design, literature parameter extraction and documentation. All parameters were checked against the cited sources; the team is responsible for the results.
