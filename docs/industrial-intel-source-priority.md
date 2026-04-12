# Industrial Intel, Source Priority Matrix

## Purpose

Refine the Industrial Intel source list into a practical ingest order.

Important distinction:
- a source can be strategically important in the Edmonton market
- but still be harder to crawl reliably from day one

So this matrix separates:
- **market importance**
- **probable ingest difficulty**
- **recommended implementation phase**

---

# Core target sources

## 1. Cushman & Wakefield / CW Edmonton
- URL: `cwedm.com`
- Role: core Edmonton industrial source
- Market importance: **high**
- Current state: already part of the local prototype
- Recommended phase: **Phase 1**
- Notes: treat `Cushman`, `CW Edmonton`, and `cwedm.com` as the same source family, not separate sources

## 2. CBRE
- URL: `cbre.ca`
- Role: major national industrial inventory source
- Market importance: **high**
- Current state: strategically important, but anti-bot may be an issue depending on host/path
- Recommended phase: **Phase 2**
- Notes: essential source, but may need host-specific handling or alternate ingest method

## 3. Colliers International
- URL: `collierscanada.com`
- Role: major national industrial inventory source
- Market importance: **high**
- Current state: strategically important, but anti-bot may be an issue depending on host/path
- Recommended phase: **Phase 2**
- Notes: should be treated as a priority source even if implementation is harder

## 4. Avison Young
- URL: `avisonyoung.ca`
- Role: major brokerage source
- Market importance: **high**
- Current state: not yet a live ingest path
- Recommended phase: **Phase 2**
- Notes: important enough to stay on the core roadmap

## 5. JLL (Jones Lang LaSalle)
- URL: `jll.ca`
- Role: major brokerage source
- Market importance: **high**
- Current state: parser not implemented yet
- Recommended phase: **Phase 2**
- Notes: should be in the main national-source wave

## 6. Marcus & Millichap
- URL: `marcusmillichap.com`
- Role: major investment/brokerage source, can still surface relevant inventory intel
- Market importance: **medium-high**
- Current state: not yet implemented
- Recommended phase: **Phase 3**
- Notes: useful, but likely not as core to the first industrial ops slice as CW/CBRE/Colliers/JLL

---

# Strong regional / specialized firms

## 7. NAI Commercial
- URL: `naiedmonton.com`
- Role: strong Edmonton-market regional source
- Market importance: **high**
- Current state: tailored fetch path still needed; prior attempts hit response issues
- Recommended phase: **Phase 2**
- Notes: should be treated as more important than a generic long-tail source because of local relevance

## 8. Royal Park Realty
- URL: `royalparkrealty.com`
- Role: strong industrial / Nisku / Leduc local source
- Market importance: **high**
- Current state: parser not implemented yet
- Recommended phase: **Phase 2**
- Notes: high local value, especially for the markets Pat actually cares about

## 9. Cresa
- URL: `cresa.com`
- Role: occupier / tenant-only representation source
- Market importance: **medium-high**
- Current state: parser not implemented yet
- Recommended phase: **Phase 3**
- Notes: strategically valuable because it can complement owner/listing-heavy sources with occupier-side intel

---

# Recommended implementation grouping

## Phase 1, first live ingest wave
Start with Pat's clarified top brokerage priorities:
- Cushman & Wakefield / CW Edmonton (`cwedm.com`)
- CBRE (`cbre.ca`)
- Avison Young (`avisonyoung.ca`)
- NAI Commercial Edmonton (`naiedmonton.com`)
- Colliers (`collierscanada.com`)
- JLL (`jll.ca`)

## Phase 2, landlord / regional / complementary wave
After the first brokerage wave is stable, bring in:
- Royal Park Realty
- landlord / owner / institutional sources
- broker email forwards / blast parsing

## Phase 3, enrichment / broader coverage wave
Then add:
- Marcus & Millichap
- Cresa
- other specialized or opportunistic sources

---

# Practical recommendation

## Strategic priority list
Using Pat's clarified brokerage direction, the top priority list should now be:
1. Cushman & Wakefield / CW Edmonton
2. CBRE
3. Avison Young
4. NAI Commercial Edmonton
5. Colliers
6. JLL

## Engineering priority list
If ranking by safest implementation order while preserving Pat's business priorities:
1. Cushman & Wakefield / CW Edmonton
2. NAI Commercial Edmonton if fetch patterns are manageable
3. Avison Young / JLL depending on site structure
4. CBRE / Colliers once host constraints and anti-bot behavior are understood
5. Royal Park + landlord wave after the core brokerage set
6. Marcus & Millichap / Cresa later

---

# Key design takeaway

Do not confuse:
- **important source**
with
- **easy source**

Industrial Intel should keep the important sources on the roadmap even when they are harder to automate. In some cases the right answer may be:
- partial automation
- manual assist
- email-feed augmentation
- clawbot supervision for edge cases

That is still valid if it gets the right data into Tool B.
