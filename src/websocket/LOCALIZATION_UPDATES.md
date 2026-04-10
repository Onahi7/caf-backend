# WebSocket Localization Updates

## Overview
Updated WebSocket events to include properly formatted currency and payment method display for Sierra Leone localization.

## Changes Made

### Backend Changes

#### 1. Updated Event Interfaces (`events.service.ts`)
- Added `paymentMethod` field to `SaleUpdateEvent`
- Added optional `paymentReference` field to `SaleUpdateEvent`

#### 2. Updated WebSocket Gateway (`websocket.gateway.ts`)
- Enhanced `SaleUpdateDto` interface with:
  - `totalFormatted`: Pre-formatted currency string (e.g., "Le 150,000.00")
  - `paymentMethod`: Raw payment method value
  - `paymentMethodLabel`: Human-readable label (e.g., "Orange Money")
  - `paymentReference`: Optional mobile money transaction reference

- Updated `handleSaleUpdateEvent` to:
  - Format currency using `CurrencyUtil.format()`
  - Map payment methods to display labels using `PAYMENT_METHOD_LABELS`
  - Include payment reference when available

#### 3. Updated Sale Services
- **checkout.service.ts**: Updated `emitSaleUpdate` call to include `paymentMethod` and `paymentReference`
- **sales.service.ts**: Updated return event emission to include payment information

### Frontend Changes

#### 4. Updated WebSocket Hook (`useWebSocket.ts`)
- Added `SaleUpdate` interface with:
  - `totalFormatted`: Pre-formatted currency string
  - `paymentMethod`: Payment method identifier
  - `paymentMethodLabel`: Human-readable payment method name
  - `paymentReference`: Optional transaction reference
  
- Added `onSaleUpdate` callback option
- Updated event listener to use correct event name: `sale:update`
- Added handler for sale update events

### Testing

#### 5. Created WebSocket Gateway Tests (`websocket.gateway.spec.ts`)
Tests verify:
- Currency formatting in sale update events
- Payment method label mapping for all six payment methods
- Consistent currency formatting across different amounts
- Optional payment reference handling
- Mobile money payment method display

## Requirements Validated

- **Requirement 1.4**: Currency formatting consistency across all interfaces including WebSocket events
- **Requirement 2.7**: Payment method recording and transmission in real-time updates

## Event Flow

1. Sale is completed in `CheckoutService` or returned in `SalesService`
2. Service emits `SaleUpdateEvent` with payment details
3. `WebSocketGateway.handleSaleUpdateEvent` receives event
4. Gateway formats currency and maps payment method label
5. Enhanced `SaleUpdateDto` is broadcast to connected clients
6. Frontend receives formatted data ready for display

## Example Event Payload

```json
{
  "saleId": "507f1f77bcf86cd799439011",
  "branchId": "507f191e810c19729de860ea",
  "shiftId": "507f191e810c19729de860eb",
  "total": 150000,
  "totalFormatted": "Le 150,000.00",
  "paymentMethod": "orange_money",
  "paymentMethodLabel": "Orange Money",
  "paymentReference": "OM123456789",
  "items": [...],
  "updateType": "completed",
  "timestamp": "2025-12-08T10:30:00.000Z"
}
```

## Benefits

1. **Consistency**: Currency formatting matches backend and frontend utilities
2. **Performance**: Pre-formatted values reduce client-side processing
3. **Localization**: Payment method labels are ready for display
4. **Real-time**: All terminals receive properly formatted updates instantly
5. **Mobile Money**: Transaction references are included for audit trail
