import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WebSocketGateway } from './websocket.gateway';
import { UsersService } from '../users/users.service';

describe('WebSocket permissions after staff changes', () => {
  let gateway: WebSocketGateway;
  let users: { findById: jest.Mock; assertActiveAssignment: jest.Mock };
  let client: any;
  beforeEach(() => {
    users = {
      findById: jest
        .fn()
        .mockResolvedValue({
          _id: 'staff',
          role: 'cashier',
          branchId: 'new',
          isActive: true,
        }),
      assertActiveAssignment: jest.fn().mockResolvedValue(undefined),
    };
    gateway = new WebSocketGateway(
      new ConfigService(),
      {
        verifyAsync: jest
          .fn()
          .mockResolvedValue({
            sub: 'staff',
            role: 'super_admin',
            branchId: 'old',
          }),
      } as unknown as JwtService,
      {} as never,
      users as unknown as UsersService,
    );
    client = {
      id: 'socket',
      handshake: { auth: { token: 'signed-token' } },
      data: {},
      join: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
    };
  });
  it('joins only the current branch and cannot reuse old admin privileges', async () => {
    await gateway.handleConnection(client);
    expect(client.join.mock.calls).toEqual([['user:staff'], ['branch:new']]);
    expect(client.data.role).toBe('cashier');
  });
  it('does not restore a removed branch from token claims', async () => {
    users.findById.mockResolvedValue({
      _id: 'staff',
      role: 'auditor',
      isActive: true,
    });
    await gateway.handleConnection(client);
    expect(client.join.mock.calls).toEqual([['user:staff']]);
  });
  it.each(['inactive', 'deleted', 'inactive-branch'])(
    'rejects %s accounts',
    async (state) => {
      if (state === 'inactive')
        users.findById.mockResolvedValue({ isActive: false });
      if (state === 'deleted')
        users.findById.mockRejectedValue(new Error('not found'));
      if (state === 'inactive-branch')
        users.assertActiveAssignment.mockRejectedValue(
          new Error('inactive branch'),
        );
      await gateway.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
    },
  );
  it('disconnects existing sessions on staff or branch access changes', () => {
    const disconnectSockets = jest.fn();
    const room = jest.fn().mockReturnValue({ disconnectSockets });
    gateway.server = { in: room } as any;
    gateway.handleUserAccessChanged({ userId: 'staff' });
    gateway.handleBranchAccessChanged({ branchId: 'old' });
    expect(room.mock.calls).toEqual([['user:staff'], ['branch:old']]);
    expect(disconnectSockets).toHaveBeenCalledTimes(2);
    expect(disconnectSockets).toHaveBeenCalledWith(true);
  });
});
