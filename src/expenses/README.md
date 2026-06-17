# Expenses Module

## Overview
The Expenses module tracks cash expenses during shifts for accounting and reconciliation purposes. It ensures expenses are properly logged and associated with open shifts.

## Features

### Expense Management
- OK Create expenses during active shifts
- OK Categorize expenses (supplies, maintenance, utilities, petty cash, other)
- OK Track expense details (amount, description, receipt number)
- OK Soft delete with audit trail
- OK Prevent modifications to closed shift expenses

### Reporting & Analytics
- OK Get expenses by shift
- OK Get expenses by branch
- OK Calculate total expenses by shift
- OK Aggregate expenses by category
- OK Filter expenses by date range

## Schema

### Expense Model
```typescript
{
  branchId: ObjectId       // Reference to branch
  shiftId: ObjectId        // Reference to shift
  recordedBy: ObjectId     // User who recorded the expense
  amount: Number           // Expense amount (min: 0)
  category: Enum           // supplies | maintenance | utilities | petty_cash | other
  description: String      // Required description (max 500 chars)
  notes?: String           // Optional notes (max 1000 chars)
  receiptNumber?: String   // Optional receipt reference
  isDeleted: Boolean       // Soft delete flag
  deletedBy?: ObjectId     // User who deleted
  deletedAt?: Date         // Deletion timestamp
  createdAt: Date          // Auto-generated
  updatedAt: Date          // Auto-generated
}
```

### Indexes
- `branchId + createdAt` (descending) - Efficient branch queries
- `shiftId` - Quick shift lookups
- `recordedBy + createdAt` (descending) - User expense history
- `isDeleted` - Filter deleted records

## API Endpoints

### Create Expense
```http
POST /expenses
Authorization: Bearer {token}
Content-Type: application/json

{
  "branchId": "507f1f77bcf86cd799439011",
  "shiftId": "507f1f77bcf86cd799439012",
  "recordedBy": "507f1f77bcf86cd799439013",
  "amount": 25.50,
  "category": "supplies",
  "description": "Office supplies purchase",
  "notes": "Printer paper and pens",
  "receiptNumber": "RCP-001"
}
```

**Validation:**
- OK Shift must exist and be open
- OK Shift must belong to the specified branch
- OK Amount must be between 0.01 and 1,000,000
- OK Description is required (max 500 chars)

**Response:** `200 OK` with created expense document

---

### Get All Expenses (Filtered)
```http
GET /expenses?branchId={id}&shiftId={id}&category={cat}&startDate={date}&endDate={date}
Authorization: Bearer {token}
```

**Query Parameters:**
- `branchId` (optional) - Filter by branch
- `shiftId` (optional) - Filter by shift
- `recordedBy` (optional) - Filter by user
- `category` (optional) - Filter by category
- `startDate` (optional) - ISO date string
- `endDate` (optional) - ISO date string

**Response:** Array of expense documents

---

### Get Expense by ID
```http
GET /expenses/:id
Authorization: Bearer {token}
```

**Response:** Expense document with populated `recordedBy` user info

---

### Get Expenses by Shift
```http
GET /expenses/shift/:shiftId
Authorization: Bearer {token}
```

**Response:** Array of expenses for the specified shift

---

### Get Expenses by Branch
```http
GET /expenses/branch/:branchId?limit=50
Authorization: Bearer {token}
```

**Response:** Array of recent expenses for the branch

---

### Get Total Expenses by Shift
```http
GET /expenses/shift/:shiftId/total
Authorization: Bearer {token}
```

**Response:**
```json
{
  "total": 125.75
}
```

---

### Get Expenses by Category
```http
GET /expenses/branch/:branchId/by-category?startDate={date}&endDate={date}
Authorization: Bearer {token}
```

**Response:**
```json
[
  {
    "category": "supplies",
    "total": 150.00,
    "count": 5
  },
  {
    "category": "maintenance",
    "total": 75.50,
    "count": 2
  }
]
```

---

### Soft Delete Expense
```http
DELETE /expenses/:id
Authorization: Bearer {token}
```

**Validation:**
- OK Expense must exist
- OK Associated shift must still be open
- OK Only super_admin or branch_manager can delete

**Response:** Deleted expense document with `isDeleted: true`

## Role-Based Access

| Endpoint | Roles |
|----------|-------|
| Create Expense | super_admin, branch_manager, cashier |
| Get Expenses | super_admin, branch_manager, cashier, auditor |
| Get by Category | super_admin, branch_manager, auditor |
| Delete Expense | super_admin, branch_manager |

## Business Rules

### 1. Shift Validation
- Expenses can only be added to **open shifts**
- Shift must belong to the specified branch
- Closed shift expenses cannot be deleted

### 2. Data Integrity
- All monetary amounts use 2 decimal precision
- Soft delete preserves audit trail
- User who recorded and deleted is tracked

### 3. Reporting
- Expenses reduce expected cash in shift reconciliation
- Category aggregation helps identify spending patterns
- Date range filtering for periodic reports

## Integration with Shifts

The Expenses module is tightly integrated with the Shifts module:

1. **Shift Reports** include total expenses
2. **Expected Cash** calculation factors in expenses:
   ```
   Expected Cash = Opening Cash + Sales - Expenses
   ```
3. **Variance Analysis** considers expenses in reconciliation

## Usage Example

### Record a Shift Expense
```typescript
// Cashier buys supplies during shift
const expense = await expensesService.create({
  branchId: currentBranch._id,
  shiftId: currentShift._id,
  recordedBy: currentUser._id,
  amount: 35.99,
  category: ExpenseCategory.SUPPLIES,
  description: 'Register receipt paper rolls',
  receiptNumber: 'STORE-12345'
});
```

### Get Shift Summary with Expenses
```typescript
const shiftId = '507f1f77bcf86cd799439011';
const totalExpenses = await expensesService.getTotalByShift(shiftId);
const expenses = await expensesService.findByShift(shiftId);

console.log(`Total Expenses: ${totalExpenses}`);
console.log(`Number of Expenses: ${expenses.length}`);
```

### Weekly Expense Report by Category
```typescript
const startOfWeek = new Date('2025-12-08');
const endOfWeek = new Date('2025-12-14');

const categoryTotals = await expensesService.getTotalByCategory(
  branchId,
  startOfWeek,
  endOfWeek
);

// Output:
// [
//   { category: 'supplies', total: 450.00, count: 12 },
//   { category: 'maintenance', total: 200.00, count: 3 },
//   { category: 'utilities', total: 150.00, count: 2 }
// ]
```

## Future Enhancements

- [ ] Expense approval workflow
- [ ] Attach receipt images/PDFs
- [ ] Budget limits per category
- [ ] Recurring expenses
- [ ] Export expense reports to CSV/PDF
- [ ] Expense forecasting
- [ ] Integration with accounting software
