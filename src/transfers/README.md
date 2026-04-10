# Transfers Module

This module handles inter-branch inventory transfers with approval workflow.

## Requirements Implemented

- **4.1**: Transfer request creation with source/destination branches, product, batch, and quantity
- **4.2**: Atomic transfer execution with MongoDB transactions
- **4.3**: Support for outlet-to-outlet, HQ-to-outlet, and outlet-to-HQ transfers
- **4.5**: Transfer approval workflow preventing stock movement until approval
- **10.4**: Pending transfer visibility for HQ dashboard

## Properties Validated

- **Property 15**: Transfer structure completeness
- **Property 16**: Transfer atomicity (decrement source, increment destination in single transaction)
- **Property 17**: Transfer type support (outlet-to-outlet, HQ-to-outlet, outlet-to-HQ)
- **Property 18**: Transfer approval workflow

## API Endpoints

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| POST | /transfers | Create transfer request | Super Admin, Branch Manager, Pharmacist |
| GET | /transfers?branchId={branchId}&status={status} | List transfers with filtering | Super Admin, Branch Manager, Pharmacist, Auditor |
| GET | /transfers/pending | Get pending transfers | Super Admin, Branch Manager |
| GET | /transfers/pending/branch/:branchId | Get pending transfers for branch | Super Admin, Branch Manager |
| GET | /transfers/stats | Get transfer statistics | Super Admin, Branch Manager, Auditor |
| GET | /transfers/:id | Get transfer by ID | Super Admin, Branch Manager, Pharmacist, Auditor |
| PATCH | /transfers/:id/approve | Approve and execute transfer | Super Admin, Branch Manager |
| PATCH | /transfers/:id/reject | Reject transfer | Super Admin, Branch Manager |

## Transfer Workflow

1. **Request**: User creates transfer request (status: PENDING)
2. **Validation**: System validates batch exists, has sufficient quantity, and is not expired
3. **Approval/Rejection**: Authorized user approves or rejects the transfer
4. **Execution** (on approval):
   - Decrement stock at source branch
   - Create stock movement for source (transfer out)
   - Create new batch at destination branch
   - Create stock movement for destination (transfer in)
   - Mark transfer as COMPLETED
5. **Atomicity**: All operations wrapped in MongoDB transaction; rollback on any failure

## Transfer Types

- `outlet-to-outlet`: Transfer between two non-HQ branches
- `hq-to-outlet`: Transfer from headquarters to a branch
- `outlet-to-hq`: Transfer from a branch to headquarters

## Transfer Statuses

- `pending`: Awaiting approval
- `approved`: Approved but not yet completed (intermediate state)
- `rejected`: Transfer request was rejected
- `completed`: Transfer successfully executed
