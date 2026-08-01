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
2. **Verify Interactive Header**:
   - Confirm the **`7 Services Active`** badge display (`:8125` to `:8147`).
3. **Test Interactive Action Buttons**:
   - Click **`+ New Tax Rule`** ➔ Confirm the green notification banner appears (*"Action triggered: New Tax Rule..."*).
   - Click **`Evaluate Determination`** ➔ Confirm notification feedback.
   - Click **`Assemble Filing`** ➔ Confirm notification feedback.
4. **Verify Data Tables**:
   - Check **Configured Tax Rules** table (`UK-VAT-STD-2026`, `US-CIT-FED-2026`, `SG-GST-2026`).
   - Check **VAT Returns** table (`GB-987654321`, `2026-Q1`, `2026-Q2`).

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
