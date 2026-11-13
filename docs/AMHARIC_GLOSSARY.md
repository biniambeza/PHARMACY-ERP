# Amharic glossary (for native-speaker review)

The Amharic UI strings (`frontend/src/i18n/locales/am/*.json`) and the server texts
(`backend/i18n/messages.js`: receipts, SMS, emails, stock alerts) use the terms below.
Please review them with pharmacy staff. If you change a term, change it everywhere: search
the `am` folder and `backend/i18n/messages.js` for the old word.

## Key terms

| English | Amharic (chosen) | Notes / forms | Replaced variants |
|---|---|---|---|
| Pharmacy | መድኃኒት ቤት | plural መድኃኒት ቤቶች; "your pharmacy" መድኃኒት ቤትዎ; "the pharmacy" መድኃኒት ቤቱ | ፋርማሲ (76 occurrences) |
| Pharmacist | ፋርማሲስት | role name, kept | – |
| Medicine | መድኃኒት | plural መድኃኒቶች | መድሃኒት (6) |
| Sale | ሽያጭ | plural ሽያጮች | – |
| Invoice (sales) | ደረሰኝ | "invoice no." የደረሰኝ ቁጥር; the app uses one word for invoice and receipt | – |
| Tax invoice | የግብር ደረሰኝ | | – |
| Fiscal / e-invoice | የፊስካል ደረሰኝ / ኤሌክትሮኒክ ደረሰኝ | | – |
| Supplier invoice | ደረሰኝ (on the Payables pages) | | – |
| Receipt | ደረሰኝ | | – |
| Goods receipt (PO delivery) | ርክክብ | "receipt history" የርክክብ ታሪክ | – |
| Stock | ክምችት | "low stock" ዝቅተኛ ክምችት | – |
| Batch | ባች | | – |
| Medicine supplier | አቅራቢ | plural አቅራቢዎች | – |
| Purchase order | የግዢ ትዕዛዝ | plural የግዢ ትዕዛዞች | – |
| Shift | ፈረቃ | | – |
| Return (noun) | ተመላሽ | plural ተመላሾች; status "returned" ተመልሷል / የተመለሰ; verb መመለስ | – |
| Credit note | የተመላሽ ማስታወሻ | | – |
| Insurance | ኢንሹራንስ | insurer ኢንሹራንስ ሰጪ; the official CBHI name "የማህበረሰብ ጤና መድን" is kept | መድን (29) |
| Prescription | የሐኪም ትዕዛዝ | plural የሐኪም ትዕዛዞች; "the prescription" (object) የሐኪም ትዕዛዙን; OTC ያለ ሐኪም ትዕዛዝ | ማዘዣ / የሐኪም ማዘዣ (34) |
| Prescriber | አዛዥ | | – |
| VAT | ተ.እ.ታ (ተጨማሪ እሴት ታክስ) | receipt header `TIN/ተ.እ.ታ` | VAT |
| SKU (product line) | የምርት ዓይነት | plural የምርት ዓይነቶች | SKU |
| SMS | ኤስኤምኤስ | | SMS |
| Calendar | የቀን መቁጠሪያ | Gregorian ግሪጎሪያን (የፈረንጅ), Ethiopian የኢትዮጵያ | – |
| Ethiopian date suffix | ዓ.ም. | e.g. `መስከረም 1, 2017 ዓ.ም.` | – |

Ethiopian month names: መስከረም, ጥቅምት, ኅዳር, ታኅሣሥ, ጥር, የካቲት, መጋቢት, ሚያዝያ, ግንቦት,
ሰኔ, ሐምሌ, ነሐሴ, ጳጉሜን. In English and Afaan Oromo the app shows Meskerem, Tikimt, Hidar,
Tahsas, Tir, Yekatit, Megabit, Miyazya, Ginbot, Sene, Hamle, Nehase, Pagume. The Afaan Oromo
era suffix `A.L.I.` also needs to be confirmed.

## Values left the same as English on purpose

These are codes, file formats or names: `CSV`, `PDF`, `IP`, `IRN`, `TIN`, `{{value}}%`,
the language names `English` and `Afaan Oromoo` (each language is shown in its own name in the
language picker), and medicine names and units (`mg`, `ml`). `POS` and `FEFO` are not shown
on their own.

## Questions for the reviewer

1. Should we write **መድኃኒት ቤት** or **ፋርማሲ**? Both are used in Ethiopia. The app now uses መድኃኒት ቤት.
2. Should we write **ኢንሹራንስ** or **መድን**? The app now uses ኢንሹራንስ, but keeps the official CBHI
   name "የማህበረሰብ ጤና መድን".
3. Should we write **የሐኪም ትዕዛዝ** or **(የሐኪም) ማዘዣ**? The app now uses የሐኪም ትዕዛዝ. Some table
   headers became long, for example "የወረቀት የሐኪም ትዕዛዝ ቁ.".
4. Should "invoice" have its own word, for example **ኢንቮይስ** or **የሽያጭ ደረሰኝ**? Right now
   invoice and receipt are both **ደረሰኝ**.
5. Receipt/SMS wording in `backend/i18n/messages.js`, for example `ጠቅላላ` (total), `የተከፈለ` (paid),
   `መልስ` (change), `ቀሪ ዕዳ` (balance due), `ዱቤ` (credit).
