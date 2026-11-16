# Assets and Licenses

All third-party assets bundled with the BRD Decision Aid, where they came from, and how to credit them. Retrieved 2026-11-13.

Every asset below is a **work of the U.S. federal government** (USDA, NOAA) and is in the **public domain in the United States** (17 U.S.C. § 105). Attribution is not legally required, but the agencies ask for credit, and we give it. Public-domain status does not imply that USDA, NOAA, or anyone pictured endorses this project. Do not use the images in a way that suggests endorsement.

## Images (`public/images/`)

All six images come from Wikimedia Commons, which mirrors them from the official USDA / APHIS Flickr accounts. Commons license tag: [PD-USGov-USDA](https://commons.wikimedia.org/wiki/Template:PD-USGov-USDA) ("work of a United States Department of Agriculture employee, taken or made as part of that person's official duties").

**Modifications (same for all six):** downloaded as the 1920 px Commons thumbnail, resized to 1600 px wide (Lanczos), re-encoded as a progressive JPEG at quality 82, and EXIF metadata stripped. Nothing was cropped and no colors were changed.

| File | Title (Commons) | Author / creator | Source page | License | Size | Required attribution text |
|---|---|---|---|---|---|---|
| `public/images/feedlot-hero.jpg` | Cattle in Canyon, Texas (9383). "Dawn Cattle Feeders in Canyon, Texas. Feedlot." (19 Jun 2021) | Preston Keres, USDA/FPAC | https://commons.wikimedia.org/wiki/File:Cattle_in_Canyon,_Texas_(9383).jpg | Public domain (U.S. Government work; [PD-USGov-USDA](https://commons.wikimedia.org/wiki/Template:PD-USGov-USDA)) | 1600×900, 215 KB | "USDA photo by Preston Keres" |
| `public/images/cattle-in-pens.jpg` | Cattle in Canyon, Texas (9382). "Dawn Cattle Feeders in Canyon, Texas." (19 Jun 2021) | Preston Keres, USDA/FPAC | https://commons.wikimedia.org/wiki/File:Cattle_in_Canyon,_Texas_(9382).jpg | Public domain (U.S. Government work) | 1600×900, 316 KB | "USDA photo by Preston Keres" |
| `public/images/pen-riders.jpg` | AMS Training at West Texas A&M University (20220923-AMS-PJK-1020). Pen riders on horseback in the pens at Dawn Cattle Feeders, Canyon, TX (Oct 2022) | Preston Keres, USDA/FPAC (uploaded by USDAgov) | https://commons.wikimedia.org/wiki/File:AMS_Training_at_West_Texas_A%26M_University_(20220923-AMS-PJK-1020).jpg | Public domain (U.S. Government work) | 1600×900, 256 KB | "USDA/FPAC photo by Preston Keres" |
| `public/images/feed-bunk-truck.jpg` | AMS Training at West Texas A&M University (20220923-AMS-PJK-1079). Feed truck delivering ration along a feed bunk, Dawn Cattle Feeders, Canyon, TX (Oct 2022) | Preston Keres, USDA/FPAC (uploaded by USDAgov) | https://commons.wikimedia.org/wiki/File:AMS_Training_at_West_Texas_A%26M_University_(20220923-AMS-PJK-1079).jpg | Public domain (U.S. Government work) | 1600×900, 289 KB | "USDA/FPAC photo by Preston Keres" |
| `public/images/cattle-trailer-arrival.jpg` | Douglas, Arizona – Agua Prieta, Mexico port of entry on August 24, 2026, to mark the port's reopening to cattle imports from Mexico – 34. Livestock trailer rigs lined up at night to haul cattle (24 Aug 2026) | Lance Cheung, USDA Media (uploaded by USDAgov) | https://commons.wikimedia.org/wiki/File:Douglas,_Arizona_-_Agua_Prieta,_Mexico_port_of_entry_on_August_24,_2026,_to_mark_the_port%E2%80%99s_reopening_to_cattle_imports_from_Mexico_-_34.jpg (Flickr original: https://www.flickr.com/photos/41284017@N08/55489297844/) | Public domain (U.S. Government work) | 1600×900, 289 KB | "USDA photo by Lance Cheung" |
| `public/images/veterinarian-chute.jpg` | 11VS03-12 (34484069454). "An APHIS Veterinarian inspecting cow" (18 Aug 2011) | R. Anson Eaglin, USDA APHIS | https://commons.wikimedia.org/wiki/File:11VS03-12_(34484069454).jpg | Public domain (U.S. Government work) | 1600×1065, 460 KB | "USDA APHIS photo by R. Anson Eaglin" |

Notes:
- Canyon, TX (Randall County) is in the Texas Panhandle, about 15 mi south of Amarillo, so four of the six images show a real Panhandle feedlot.
- The trailer image was taken in Douglas, AZ, not the Panhandle. It is a night scene with dark tones, which suits a "new arrivals" banner. Other shots from the same USDA set (dusk trailers, cattle sorted for loading) are on Commons if a brighter image is wanted.
- Recognizable people appear in `pen-riders.jpg` and `veterinarian-chute.jpg`. Use those two as illustrations only, not for anything that implies a person or USDA endorses the product.

## Data (`data/raw/`)

| File | Title | Creator | Source URL | License | Modifications | Required citation |
|---|---|---|---|---|---|---|
| `data/raw/noaa_amarillo_2023_2025.csv` (85 KB) | GHCN-Daily, station USW00023047, AMARILLO AIRPORT, TX US | NOAA National Centers for Environmental Information (NCEI) | https://www.ncei.noaa.gov/access/services/data/v1?dataset=daily-summaries&stations=USW00023047&startDate=2023-01-01&endDate=2025-12-31&dataTypes=TMAX,TMIN,PRCP,AWND&format=csv&units=standard&includeStationName=true | Public domain (U.S. Government work); NOAA data are freely available without restriction | None (raw API output) | See NCEI citation below |
| `data/raw/noaa_lubbock_2023_2025.csv` (99 KB) | GHCN-Daily, USW00023042, LUBBOCK INTERNATIONAL AIRPORT, TX US | NOAA NCEI | same query with `stations=USW00023042` | Public domain | None | See below |
| `data/raw/noaa_dodge_city_2023_2025.csv` (97 KB) | GHCN-Daily, USW00013985, DODGE CITY REGIONAL AIRPORT, KS US | NOAA NCEI | same query with `stations=USW00013985` | Public domain | None | See below |
| `data/raw/noaa_garden_city_2023_2025.csv` (98 KB) | GHCN-Daily, USW00023064, GARDEN CITY REGIONAL AIRPORT, KS US | NOAA NCEI | same query with `stations=USW00023064` | Public domain | None | See below |
| `data/raw/usda_ers_livestock_prices.xlsx` (105 KB) | Livestock and Meat Domestic Data: Livestock prices | USDA Economic Research Service (from NASS and AMS data) | https://www.ers.usda.gov/media/5536/livestock-prices.xlsx (landing page: https://www.ers.usda.gov/data-products/livestock-and-meat-domestic-data) | Public domain (U.S. Government work) | None (raw download) | See ERS citation below |
| `data/raw/cattle_prices_tidy.csv` (29 KB) | Monthly cattle prices, Jan 2023 to Dec 2025, tidy format | Derived from the ERS workbook above | as above | Public domain | Took the "Historical" sheet, 2023-01 to 2025-12, 7 series; reshaped to long format (date, series, price_usd_per_cwt, source_url); rounded to 2 decimals; dropped NA cells (TX/OK/NM slaughter steers, Dec 2025) | See ERS citation below |

Units: `units=standard`, so TMAX and TMIN are in °F, PRCP is in inches, and AWND (average daily wind speed) is in mph.

**NCEI-recommended citation (GHCN-Daily):**

> Menne, Matthew J., Imke Durre, Bryant Korzeniewski, Shelley McNeill, Kristy Thomas, Xungang Yin, Steven Anthony, Ron Ray, Russell S. Vose, Byron E. Gleason, and Tamara G. Houston (2012): Global Historical Climatology Network - Daily (GHCN-Daily), Version 3. Stations USW00023047, USW00023042, USW00013985, USW00023064; elements TMAX, TMIN, PRCP, AWND; 2023-01-01 to 2025-12-31. NOAA National Climatic Data Center. doi:10.7289/V5D21VHZ. Accessed 2026-11-13.
>
> Menne, M.J., I. Durre, R.S. Vose, B.E. Gleason, and T.G. Houston, 2012: An overview of the Global Historical Climatology Network-Daily Database. *Journal of Atmospheric and Oceanic Technology*, 29, 897–910. doi:10.1175/JTECH-D-11-00103.1.

Short in-app credit: "Weather: NOAA NCEI GHCN-Daily (public domain)."

**ERS citation:**

> USDA, Economic Research Service. *Livestock and Meat Domestic Data*, "Livestock prices" (livestock-prices.xlsx). Calculations by ERS using data from USDA National Agricultural Statistics Service and USDA Agricultural Marketing Service. https://www.ers.usda.gov/data-products/livestock-and-meat-domestic-data. Accessed 2026-11-13.

Short in-app credit: "Prices: USDA ERS Livestock & Meat Domestic Data (public domain)."

### Price series in `cattle_prices_tidy.csv` (monthly averages, $/cwt)

| series | description | months |
|---|---|---|
| `feeder_steer_OKC_med_lg_1_500_550lb` | Feeder steers, Medium & Large #1, 500–550 lb, Oklahoma City | 36 |
| `feeder_steer_OKC_med_lg_1_600_650lb` | Feeder steers, M&L #1, 600–650 lb, OKC | 36 |
| `feeder_steer_OKC_med_lg_1_750_800lb` | Feeder steers, M&L #1, 750–800 lb, OKC | 36 |
| `feeder_heifer_OKC_med_lg_1_450_500lb` | Feeder heifers, M&L #1, 450–500 lb, OKC | 36 |
| `feeder_heifer_OKC_med_lg_1_700_750lb` | Feeder heifers, M&L #1, 700–750 lb, OKC | 36 |
| `slaughter_steer_TX_OK_NM_35_65pct_choice_negotiated` | Direct slaughter (fed) steers, negotiated, TX/OK/NM, 35–65% Choice | 35 (Dec 2025 not reported) |
| `slaughter_steer_NE_65_80pct_choice_negotiated` | Direct slaughter steers, negotiated, Nebraska, 65–80% Choice | 36 |

Limitations:
- The ERS workbook has no 5-area weighted fed-steer price. TX/OK/NM negotiated is the closest regional fed-cattle price for the Panhandle. ERS notes that from October 2026 this series is replaced by a combined TX/OK/NM/KS/CO region.
- The workbook has no feeder price for the 700–750 lb steer bracket; 750–800 lb is the nearest. The OKC weight brackets differ slightly from the 500–600 and 700–800 lb ranges first requested.
- For a weekly 5-area series I tried the USDA AMS LMR Datamart (`https://mpr.datamart.ams.usda.gov/services/v1.1/reports`, report LM_CT150), but the host name does not resolve from this network. A possible alternative is MyMarketNews (`https://mymarketnews.ams.usda.gov/`); its API needs a free key.

## How the weather data can feed BRD risk

Weather stress near arrival is a common risk factor for BRD in feedlot cattle. The dashboard could derive these features from the NOAA files:

- **Arrival-week temperature swing:** for each lot, take the largest day-to-day change in TMAX within ±3–7 days of arrival, or count the days with a change over 20 °F or over 30 °F.
- **Diurnal range:** the mean TMAX−TMIN in the arrival week, since large daily ranges mean cold nights after warm days.
- **Cold/wet/wind events:** PRCP > 0.25 in, with AWND > 15 mph, during the first 2 weeks on feed.
- **Seasonal priors:** risk is highest from fall to early spring, when lightweight calves arrive and the temperature range is widest.

Use the station nearest each feedlot. Amarillo and Lubbock cover the Texas Panhandle and South Plains; Dodge City and Garden City cover western Kansas.

### Data completeness (2023-01-01 to 2025-12-31, 1,096 days)

| Station | Rows | TMAX missing | TMIN missing | PRCP missing | AWND missing |
|---|---|---|---|---|---|
| Amarillo USW00023047 | 1,095 | 0.09% (2025-09-30 has no row) | 0.09% | 0.09% | 0.09% |
| Lubbock USW00023042 | 1,096 | 0% | 0% | 0% | 0.09% (1 day) |
| Dodge City USW00013985 | 1,096 | 0% | 0% | 0% | 0% |
| Garden City USW00023064 | 1,096 | 0% | 0% | 0% | 0% |

### Mean daily temperature range (TMAX − TMIN, °F) by month, averaged over 2023–2025

| Month | Amarillo | Lubbock | Dodge City | Garden City |
|---|---|---|---|---|
| Jan | 25.5 | 26.2 | 23.0 | 24.9 |
| Feb | 31.1 | 30.7 | 30.0 | 31.6 |
| Mar | 30.2 | 30.8 | 31.1 | 32.6 |
| Apr | 28.9 | 29.6 | 30.8 | 32.0 |
| May | 26.7 | 27.3 | 26.4 | 27.0 |
| Jun | 24.7 | 25.4 | 23.5 | 25.4 |
| Jul | 26.4 | 24.2 | 25.1 | 26.7 |
| Aug | 28.1 | 26.4 | 25.7 | 27.5 |
| Sep | 28.6 | 26.3 | 27.7 | 29.1 |
| Oct | 29.0 | 28.2 | 28.5 | 30.2 |
| Nov | 28.0 | 28.4 | 26.5 | 29.0 |
| Dec | 28.9 | 29.3 | 26.8 | 29.7 |
| **Mean of the 12 months** | 28.0 | 27.7 | 27.1 | 28.8 |

### Days per year with a day-to-day TMAX swing over 30 °F (|TMAX(t) − TMAX(t−1)|, consecutive calendar days)

| Year | Amarillo | Lubbock | Dodge City | Garden City |
|---|---|---|---|---|
| 2023 | 2 | 2 | 2 | 0 |
| 2024 | 4 | 5 | 0 | 1 |
| 2025 | 4 | 2 | 5 | 8 |

For context, there were 12 to 25 days per station-year with a swing over 20 °F. The largest single swings were 36 °F at Amarillo, 43 °F at Lubbock, 53 °F at Dodge City, and 57 °F at Garden City. Swings over 30 °F are rare, so a threshold of 20 °F (or a continuous "max swing in arrival window" feature) is likely to be more useful for a risk score.

Late-2025 GHCN-Daily values may still be preliminary and can be revised by NCEI quality control.
