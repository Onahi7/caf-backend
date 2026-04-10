# Inventory Module

This module handles stock movement tracking and inventory management for the pharmacy POS system.

## Overview

The inventory module provides:
- Stock movement recording and querying
- Inventory adjustments with audit trail
- Low-stock alert generation
- Stock calculations from movement history

## Components

### Schema: StockMovement
Records all stock quantity changes with full audit trail.

**Fields:**
- `branchId`: Reference to the branch
- `productId`: Reference to the product
- `batchId`: Reference to the batch
- `quantity`: Quantity change (positive for increase, negative for decrease)
- `movementType`: Type of movement (purchase, sale, transfer, adjustment, return, disposal)
- `reason`: Reason for the movement
- `userId`: User who performed the action
- `referenceId`: Optional reference to related entity (sale, transfer, PO)
- `timestamp`: When the movement occurred
- `metadata`: Additional data

### Repository: StockMovementRepository
Data access layer for stock movements.

**Key Methods:**
- `create()`: Create a new stock movement
- `findWithFilter()`: Query movements with filtering
- `findByBatch()`: Get all movements for a batch
- `calculateBatchStock()`: Sum all movements for a batch

### Service: InventoryService
Business logic for inventory operations.

**Key Methods:**
- `createMovement()`: Record a stock movement
- `getMovements()`: Query movements with filters
- `adjustInventory()`: Perform inventory adjustment with validation
- `generateLowStockAlerts()`: Get low-stock alerts for a branch
- `recordSaleMovement()`: Record a sale (stock decrease)
- `recordReturnMovement()`: Record a return (stock increase)
- `recordPurchaseMovement()`: Record a purchase receipt
- `recordTransferMovement()`: Record a transfer in/out

### Controller: InventoryController
REST API endpoints for inventory operations.

**Endpoints:**
- `GET /stock-movements`: Query stock movements with filtering
- `POST /inventory/adjust`: Create inventory adjustment
- `GET /inventory/stock-summary`: Get stock summary for a branch
- `GET /inventory/low-stock-alerts`: Get low-stock alerts
- `GET /inventory/batch-stock`: Calculate stock for a batch
- `GET /inventory/product-stock`: Calculate stock for a product at a branch

## Requirements Implemented

- **3.1**: Stock movement records with all required fields
- **3.2**: Support for all movement types
- **3.3**: Chronological ordering of movements
- **3.4**: Immutability of stock movements (no delete operations)
- **3.5**: Stock calculation from movements
- **8.4**: Low-stock alert generation
- **11.2**: Inventory adjustments with approval
- **11.3**: Adjustment audit trail

## Properties Validated

- **Property 10**: Stock movements are comprehensive
- **Property 11**: Movement type support
- **Property 12**: Stock movements are chronologically ordered
- **Property 13**: Stock movements are immutable
- **Property 14**: Stock calculation from movements
- **Property 34**: Branch-specific low stock alerts
- **Property 45**: Adjustment validation
- **Property 46**: Adjustment audit trail
