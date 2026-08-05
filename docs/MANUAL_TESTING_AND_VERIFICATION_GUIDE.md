# 🧪 Zoiko Suite — Manual Testing & Feature Verification Guide

Welcome! This guide provides step-by-step instructions for manually testing every domain feature and Postman endpoint across the **Zoiko Suite Platform**.

---

## 🌐 Section 1: Browser UI Feature Verification

### Step 1: Access the Application
1. Open your browser and navigate to: **[http://localhost:3000](http://localhost:3000)**
2. If prompted for login credentials, enter:
   - **Email**: `admin@zoikosuite.com`
   - **Password**: `Zoiko@Governance1`

---

### Step 2: Test Tax Governance (`/admin/tax`)
1. Click **Tax** in the left sidebar or go to **[http://localhost:3000/admin/tax](http://localhost:3000/admin/tax)**.

2. **Verify KPI Summary Bar** (4 metric cards at top):
   - Confirm **Active Tax Rules** card shows `4` with "All active" label.
   - Confirm **Net VAT / GST Payable** card shows `£326K` with "+33% Q2 vs Q1" trend.
   - Confirm **Corporate Tax Balance Due** card shows `$50K` with "Submitted" label.
   - Confirm **Upcoming Filing Deadlines** card shows `1` with "Action needed" label.

3. **Verify Interactive Action Header**:
   - Confirm the **`7 Services Active`** badge displays with animated pulse.
   - Confirm the **service health strip** shows 7 port badges (`:8125` → `:8147`) with green dots.
   - Click **`+ New Tax Rule`** → Confirm the **3-step modal overlay** opens:
     - Step 1: Select jurisdiction (UK/US/SG/DE) and effective date.
     - Step 2: Select tax category and rate.
     - Step 3: Review summary then click **Create Rule** → loading spinner → success screen.
   - Click **`Evaluate Determination`** → Confirm the **step-through wizard** opens with 3 sequential steps.
   - Click **`Assemble Filing`** → Confirm the **filing confirmation panel** shows draft details → click **Confirm Assembly**.

4. **Verify Tax Governance Process Timeline**:
   - Confirm 7 nodes render: Transaction → Determination → Rule Applied → Return → Filing → Authority → Settled.
   - Confirm completed steps show **green** dots, active steps show **blue/animated** dots, pending shows **amber**.
   - Click any node → Confirm the **inline detail panel** expands with service name, port, description, and example records.
   - Click another node to switch detail. Click ✕ to close.

5. **Verify Jurisdiction Overview Grid** (4 cards: UK 🇬🇧, US 🇺🇸, SG 🇸🇬, DE 🇩🇪):
   - Each card shows tax types (VAT, GST, CORPORATE_INCOME, WHT) as monospace badges.
   - Check VAT/GST status badges (ACCEPTED for Q2, FILED for Q1 in UK).
   - Check Filing status (FINALIZED for UK, PREPARED for US).
   - Check Authority status (ACTIVE for UK, US, SG; INACTIVE for DE).

6. **Verify Enhanced Tax Rules Panel** (section 1):
   - Confirm **Jurisdiction** column shows flag + code pill (🇬🇧 UK, 🇺🇸 US, 🇸🇬 SG, 🇩🇪 DE).
   - Confirm **Rate bar** shows a visual green bar proportional to the rate (e.g., 20% for UK VAT).
   - Confirm **Effective date** column shows effective_from date.
   - Confirm **Category** column shows monospace badge (VAT, CORPORATE_INCOME, GST, WITHHOLDING).
   - Check **Determinations table** has Jurisdiction column with flag pills.

7. **Verify Enhanced VAT/GST Returns Panel** (section 2):
   - Confirm **Output vs Input** column shows a blue stacked bar with compact currency labels.
   - Confirm **Period Trend** column shows `—` for first row, `+33%↑` for Q2 vs Q1.
   - Confirm **Filed By** column shows email + date in two lines.
   - Confirm **total net payable** footer shows `£326,000`.

8. **Verify Enhanced Corporate & Withholding Tax Panel** (section 3):
   - Confirm the **Tax Liability Waterfall** for the US corporate return shows pill chain:
     `Gross Revenue → – Deductions → = Taxable Income → × 21% → – Credits → Net Tax → Balance Due`.
   - Balance Due pill should have amber border highlighting.
   - Confirm WHT table has **Treaty** column with blue `🛡 Treaty` badge for `wht-001` (Germany, tax treaty exemption).
   - Confirm `wht-002` (Singapore, PENDING_REMITTANCE) and `wht-003` (UK, CALCULATED) rows appear.

9. **Verify Enhanced Filing Prep & Authority Panel** (section 4):
   - Confirm **Due Date / Countdown** column shows `Xd left` with urgency color coding.
   - Confirm **Readiness** progress bar: FINALIZED = full green bar, PREPARED = 50% blue bar.
   - For FINALIZED draft: CheckCircle2 icon appears in status badge.
   - Confirm **Auth Type** column shows styled badges: `OAuth2` (blue), `mTLS + SAML2` (purple), `Corppass OIDC` (teal).
   - Confirm **Test** button exists in Action column (disabled, with tooltip).
   - Confirm authority status shows animated pulse dot for ACTIVE connections.

---

### Step 3: Test Legal & Contracts (`/admin/legal`)
1. Click **Legal & Contracts** in the left sidebar or go to **[http://localhost:3000/admin/legal](http://localhost:3000/admin/legal)**.
2. **Test Interactive Buttons**:
   - Click **`+ Create Contract`** ➔ Confirm notification banner.
   - Click **`Draft Clause`** ➔ Confirm clause draft action.
   - Click **`Pass Resolution`** ➔ Confirm board resolution voting action.
3. **Verify Panels**:
   - Check **Contract Lifecycle Management** (`Global Enterprise Cloud Infrastructure MSA`, `cnt-2026-001`).
   - Check **Legal Obligation Tracking** (`GDPR Data Privacy Audit Compliance`).
   - Check **Board Governance & Resolutions** (`Resolution BR-2026-08`).

---

### Step 4: Test Commercial Ops (`/admin/commercial-ops`)
1. Click **Commercial Ops** in the left sidebar or go to **[http://localhost:3000/admin/commercial-ops](http://localhost:3000/admin/commercial-ops)**.
2. **Test Action Buttons**:
   - Click **`+ Issue Purchase Order`** ➔ Confirm notification feedback for `PO-2026-0414`.
   - Click **`Vendor Check`** ➔ Confirm vendor due diligence check.
   - Click **`Adjust Budget`** ➔ Confirm budget limit update.
3. **Verify Data Tables**:
   - Check **Purchase Orders** (`PO-2026-0412`, `$450,000`, `Acme Cloud Infrastructure Inc.`).
   - Check **Departmental Spend Controls** (`Engineering & Cloud Tech`, `$2,500,000` cap).

---

### Step 5: Test Payroll (`/admin/payroll`)
1. Go to **[http://localhost:3000/admin/payroll](http://localhost:3000/admin/payroll)**.
2. **Test Buttons**:
   - Click **`+ Trigger Pay Run`** ➔ Confirm pay run trigger.
   - Click **`Update Salary Structure`** ➔ Confirm salary grade update.

---

### Step 6: Test HR & Workforce (`/admin/hr`)
1. Go to **[http://localhost:3000/admin/hr](http://localhost:3000/admin/hr)**.
2. **Test Buttons**:
   - Click **`+ Add Employee`** ➔ Confirm employee onboarding trigger.
   - Click **`Submit Leave Request`** ➔ Confirm annual leave submission.

---

### Step 7: Test Compliance (`/admin/compliance`)
1. Go to **[http://localhost:3000/admin/compliance](http://localhost:3000/admin/compliance)**.
2. **Test Buttons**:
   - Click **`+ New Statutory Filing`** ➔ Confirm statutory filing creation.
   - Click **`Evaluate Compliance`** ➔ Confirm status check.

---

## 📬 Section 2: Postman Collection Manual Testing

### Option A: Testing via Next.js API Gateway (No Docker needed, Guaranteed `200/201 OK`)
1. Open **Postman**.
2. Click **Import** ➔ Select File:
   `docs/Zoiko_Suite_All_Services_Postman_Collection.json`
3. Expand **1. Tax Domain Microservices** ➔ **Tax Rules Service (:8125)**.
4. Select **List Tax Rules (Frontend Gateway 200 OK)**:
   - Method: `GET`
   - URL: `http://localhost:3000/api/v1/tax-rules`
   - Headers: `X-Tenant-Id: 11111111-1111-1111-1111-111111111111`
5. Click **Send** ➔ Status: **`200 OK`**.

### Option B: Testing Direct Go Microservice Ports (Requires Docker Compose)
1. Start Go containers in PowerShell:
   ```powershell
   docker compose -f deployments/docker-compose.yml up -d
   ```
2. In Postman, send requests to direct ports:
   - `http://localhost:8125/v1/tax-rules`
   - `http://localhost:8127/v1/vat-returns`
