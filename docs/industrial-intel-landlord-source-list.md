# Industrial Intel, Landlord Source List

## Purpose

Track landlord / owner / institutional manager websites that should be considered as first-class Industrial Intel sources alongside brokerages.

These are not the same as broker websites, but they should still fit into the same overall Tool B source registry with a different `source_type`, for example:
- `landlord_site`
- `owner_operator_site`
- `institutional_manager_site`

## Why these matter

Landlord sites can provide:
- direct availability pages
- project-specific leasing data
- industrial park inventory
- owner-controlled brochure links
- different visibility than broker sites
- early clues for off-market or lightly marketed supply

## Proposed landlord source list

### 1. York Realty
- URL: `yorkrealty.ca`
- Focus: industrial development and leasing
- Edmonton relevance: very strong, especially NW / South Edmonton
- Suggested classification: `landlord_site`
- Priority: **high**

### 2. Oxford Properties
- URL: `oxfordproperties.com`
- Focus: class A office towers and major retail centers
- Edmonton relevance: meaningful, more office/major asset oriented than pure industrial
- Suggested classification: `institutional_manager_site`
- Priority: **medium**

### 3. Epic Investment Services
- URL: `epicinvestmentservices.com`
- Focus: asset management for ICE District and suburban office assets
- Edmonton relevance: strong local owner/operator relevance
- Suggested classification: `owner_operator_site`
- Priority: **medium**

### 4. BGO (BentallGreenOak)
- URL: `bgo.com`
- Focus: global advisor with office and industrial mix
- Edmonton relevance: meaningful institutional source
- Suggested classification: `institutional_manager_site`
- Priority: **medium**

### 5. GWL Realty Advisors
- URL: `gwlrealtyadvisors.com`
- Focus: institutional-grade industrial and office parks
- Edmonton relevance: strong
- Suggested classification: `institutional_manager_site`
- Priority: **high**

### 6. Berezan Management
- URL: `berezanmanagement.com`
- Focus: office towers and retail developments
- Edmonton relevance: meaningful local owner/operator source
- Suggested classification: `owner_operator_site`
- Priority: **medium**

### 7. Baramy Investments
- URL: `baramyinvestments.com`
- Focus: long-term owner/developer of industrial and commercial space
- Edmonton relevance: strong for industrial/commercial inventory
- Suggested classification: `owner_operator_site`
- Priority: **high**

### 8. Firm Capital
- URL: `firmcapital.com`
- Focus: private equity / mortgage investment with CRE holdings
- Edmonton relevance: possible but less direct as a leasing source
- Suggested classification: `institutional_manager_site`
- Priority: **medium-low**

### 9. Fiera Real Estate
- URL: `fierarealestate.com`
- Focus: investment management with industrial and mixed-use exposure
- Edmonton relevance: potential institutional source
- Suggested classification: `institutional_manager_site`
- Priority: **medium-low**

### 10. QuadReal
- URL: `quadreal.com`
- Focus: very large office / industrial / mixed-use ownership base
- Edmonton relevance: strong
- Suggested classification: `institutional_manager_site`
- Priority: **high**

### 11. Remington Development Corp
- URL: `remingtoncorp.com`
- Focus: integrated developer / landlord with industrial and office assets
- Edmonton relevance: strong
- Suggested classification: `owner_operator_site`
- Priority: **high**

### 12. ONE Properties
- URL: `oneproperties.com`
- Focus: major Edmonton-based developer, including industrial / office
- Edmonton relevance: very strong
- Suggested classification: `owner_operator_site`
- Priority: **high**

### 13. Morguard
- URL: `morguard.com`
- Focus: wide portfolio including retail, office, and industrial
- Edmonton relevance: meaningful
- Suggested classification: `institutional_manager_site`
- Priority: **medium-high**

### 14. Dream Unlimited / Dream Industrial
- URL: `dream.ca`
- Focus: master-planned communities plus major industrial ownership links
- Edmonton relevance: meaningful
- Suggested classification: `owner_operator_site`
- Priority: **medium-high**

### 15. Summit Industrial
- URL: `summitreit.com`
- Focus: pure-play industrial
- Edmonton relevance: very relevant for industrial inventory strategy
- Suggested classification: `landlord_site`
- Priority: **high**

## Recommended treatment in Tool B

These should be modeled as source records with different metadata than brokerages.

Suggested fields/flags to emphasize:
- `source_type`
- `owner_name`
- `is_brokerage` boolean
- `is_landlord` boolean
- `market_scope`
- `asset_focus`
- `priority`
- `notes`

## Recommended near-term grouping

### Highest landlord priorities for Edmonton-focused Industrial Intel
If ranking by likely business value first:
- York Realty
- ONE Properties
- Remington Development Corp
- GWL Realty Advisors
- QuadReal
- Baramy Investments
- Summit Industrial

### Secondary landlord/institutional wave
- Morguard
- Dream
- Oxford
- Epic
- BGO
- Berezan
- Firm Capital
- Fiera

## Key takeaway

Industrial Intel should not be limited to brokerage sites.
Landlord and owner/operator inventory should be treated as first-class source inputs, especially in markets where direct-owner pages expose availability that may not appear clearly on broker platforms.
