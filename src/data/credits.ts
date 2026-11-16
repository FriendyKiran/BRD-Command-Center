/** Every external resource used, with licence. Mirrored in LICENSES-THIRD-PARTY.md. */

export const IMAGE_CREDITS = [
  { file: "images/feedlot-hero.jpg", title: "Dawn Cattle Feeders feedlot, Canyon, TX (2021)", credit: "USDA photo by Preston Keres", url: "https://commons.wikimedia.org/wiki/File:Cattle_in_Canyon,_Texas_(9383).jpg" },
  { file: "images/cattle-in-pens.jpg", title: "Cattle in pens, Dawn Cattle Feeders, Canyon, TX (2021)", credit: "USDA photo by Preston Keres", url: "https://commons.wikimedia.org/wiki/File:Cattle_in_Canyon,_Texas_(9382).jpg" },
  { file: "images/pen-riders.jpg", title: "Pen riders on horseback, Canyon, TX (2022)", credit: "USDA photo by Preston Keres", url: "https://commons.wikimedia.org/wiki/File:AMS_Training_at_West_Texas_A%26M_University_(20220923-AMS-PJK-1020).jpg" },
  { file: "images/feed-bunk-truck.jpg", title: "Feed truck at the bunk, Canyon, TX (2022)", credit: "USDA photo by Preston Keres", url: "https://commons.wikimedia.org/wiki/File:AMS_Training_at_West_Texas_A%26M_University_(20220923-AMS-PJK-1079).jpg" },
  { file: "images/cattle-trailer-arrival.jpg", title: "Livestock trailers, Douglas, AZ port of entry (2026)", credit: "USDA photo by Lance Cheung", url: "https://commons.wikimedia.org/wiki/File:Douglas,_Arizona_-_Agua_Prieta,_Mexico_port_of_entry_on_August_24,_2026,_to_mark_the_port%E2%80%99s_reopening_to_cattle_imports_from_Mexico_-_34.jpg" },
  { file: "images/veterinarian-chute.jpg", title: "APHIS veterinarian inspecting a cow (2011)", credit: "USDA APHIS photo by R. Anson Eaglin", url: "https://commons.wikimedia.org/wiki/File:11VS03-12_(34484069454).jpg" },
];

export const DATA_CREDITS = [
  {
    name: "NOAA NCEI GHCN-Daily",
    use: "Real daily max/min temperature and precipitation, 2023–2025, at Amarillo, Lubbock, Dodge City and Garden City airports: arrival-week weather risk features.",
    license: "Public domain (U.S. Government work)",
    cite: "Menne, M.J., et al. (2012). Global Historical Climatology Network – Daily (GHCN-Daily), Version 3. NOAA National Climatic Data Center. doi:10.7289/V5D21VHZ",
    url: "https://www.ncei.noaa.gov/products/land-based-station/global-historical-climatology-network-daily",
  },
  {
    name: "USDA ERS Livestock & Meat Domestic Data: livestock prices",
    use: "Monthly Oklahoma City feeder-steer and TX/OK/NM fed-steer prices for the 'current market' price preset.",
    license: "Public domain (U.S. Government work)",
    cite: "USDA Economic Research Service. Livestock and Meat Domestic Data, livestock-prices.xlsx. Accessed 2026-11-13.",
    url: "https://www.ers.usda.gov/data-products/livestock-and-meat-domestic-data",
  },
  {
    name: "US Census cartographic boundaries via us-atlas 3.0.1",
    use: "State and county outlines for the operation map.",
    license: "ISC (package); underlying Census data public domain",
    cite: "Bostock, M. us-atlas. https://github.com/topojson/us-atlas",
    url: "https://github.com/topojson/us-atlas",
  },
];

export const REFERENCES = [
  "Rojas, H.A., White, B.J., Amrine, D.E., Larson, R.L. (2022). Predicting bovine respiratory disease risk in feedlot cattle in the first 45 days post arrival. Pathogens 11:442. doi:10.3390/pathogens11040442",
  "Weber, K.M.D., Schroeder, T.C., Renter, D.G., Pendell, D.L., Tonsor, G.T. (2024). Evaluation of bovine respiratory disease morbidity in the feedlot and its effect on net return distributions. AAEA Annual Meeting poster.",
  "Johnson, K.K., Pendell, D.L. (2017). Market impacts of reducing the prevalence of bovine respiratory disease in United States beef cattle feedlots. Front. Vet. Sci. 4:189. doi:10.3389/fvets.2017.00189",
  "USDA APHIS (2019). Antimicrobial Use and Stewardship on U.S. Feedlots, 2017. National Animal Health Monitoring System.",
  "Adekunle, A., Kaniyamattam, K. (2026). Bovine respiratory disease: epidemiological drivers, transmission dynamics, and economic implications in beef production systems. (MDPI, Jan 2026).",
  "Adekunle, A., Gaines, A., Estefano, N., Lenin, D., Hole, P., Khandelwal, R., Cooke, R., Kaniyamattam, K. (2026). Mapping variability in bovine respiratory disease risk factors in beef production systems: a scoping review. Animals 16:1726. doi:10.3390/ani16111726",
];

export const SOFTWARE = [
  ["React 19 / React DOM", "MIT"],
  ["React Router 7", "MIT"],
  ["Zustand 5", "MIT"],
  ["Recharts 3", "MIT"],
  ["d3-geo, d3-scale, d3-shape, d3-array", "ISC"],
  ["topojson-client", "ISC"],
  ["us-atlas", "ISC"],
  ["Papa Parse 5", "MIT"],
  ["Lucide icons", "ISC"],
  ["Framer Motion", "MIT"],
  ["clsx", "MIT"],
  ["Inter, JetBrains Mono, Fraunces (Fontsource)", "SIL Open Font License 1.1"],
  ["Vite 8, Tailwind CSS 4, tsx, Vitest", "MIT"],
  ["TypeScript", "Apache-2.0"],
] as const;
