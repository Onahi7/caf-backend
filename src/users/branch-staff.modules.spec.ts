import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { UsersModule } from './users.module';
import { UsersService } from './users.service';
import { User } from './schemas/user.schema';
import { BranchesModule } from '../branches/branches.module';
import { BranchesService } from '../branches/branches.service';
import { Branch } from '../branches/schemas/branch.schema';
import { WebSocketModule } from '../websocket/websocket.module';
import { WebSocketGateway } from '../websocket/websocket.gateway';

describe('Branch/staff module dependency wiring', () => {
  it('resolves production module providers without database connections', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        UsersModule,
        BranchesModule,
        WebSocketModule,
      ],
    })
      .overrideProvider(getModelToken(User.name))
      .useValue({})
      .overrideProvider(getModelToken(Branch.name))
      .useValue({})
      .compile();
    expect(module.get(UsersService)).toBeDefined();
    expect(module.get(BranchesService)).toBeDefined();
    expect(module.get(WebSocketGateway)).toBeDefined();
    await module.close();
  });
});
