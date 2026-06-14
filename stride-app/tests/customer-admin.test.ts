import { describe, it, expect } from 'vitest';
import {
  ROLE_FILTER_VALUES,
  CUSTOMER_SORT_VALUES,
  roleView,
  buildCustomerOrderByClause,
  escapeLike,
  roleChangeGuard,
} from '@/lib/customer-admin';

describe('customer-admin helpers', () => {
  it('value tuples expose the expected members', () => {
    expect(ROLE_FILTER_VALUES).toEqual(['ADMIN', 'CUSTOMER']);
    expect(CUSTOMER_SORT_VALUES).toEqual(['registered', 'orders', 'spent']);
  });

  it('roleView maps both roles to a label + badge class', () => {
    expect(roleView('ADMIN').label).toMatch(/админ/i);
    expect(roleView('ADMIN').badge).toContain('badge-info');
    expect(roleView('CUSTOMER').label).toMatch(/клиент/i);
    expect(roleView('CUSTOMER').badge).toContain('badge-success');
  });

  it('buildCustomerOrderByClause whitelists sort, defaults to registered', () => {
    expect(buildCustomerOrderByClause('orders')).toBe('order_count DESC, u."createdAt" DESC');
    expect(buildCustomerOrderByClause('spent')).toBe('total_spent DESC, u."createdAt" DESC');
    expect(buildCustomerOrderByClause('registered')).toBe('u."createdAt" DESC');
    expect(buildCustomerOrderByClause(undefined)).toBe('u."createdAt" DESC');
    // anything off-whitelist falls back to the default
    expect(buildCustomerOrderByClause('hacky; DROP TABLE' as never)).toBe('u."createdAt" DESC');
  });

  it('escapeLike neutralises ILIKE wildcards and backslash', () => {
    expect(escapeLike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
    expect(escapeLike('plain')).toBe('plain');
  });

  describe('roleChangeGuard', () => {
    const base = { targetId: 't1', actingAdminId: 'admin1', adminCount: 3 };

    it('no-op when role unchanged', () => {
      expect(roleChangeGuard({ ...base, targetRole: 'ADMIN', requestedRole: 'ADMIN' }).ok).toBe(true);
    });

    it('promote CUSTOMER → ADMIN always allowed', () => {
      expect(
        roleChangeGuard({ ...base, adminCount: 0, targetRole: 'CUSTOMER', requestedRole: 'ADMIN' }).ok,
      ).toBe(true);
    });

    it('blocks demoting yourself', () => {
      const r = roleChangeGuard({
        targetId: 'admin1',
        actingAdminId: 'admin1',
        adminCount: 5,
        targetRole: 'ADMIN',
        requestedRole: 'CUSTOMER',
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/себя/i);
    });

    it('blocks demoting the last admin', () => {
      const r = roleChangeGuard({
        targetId: 't1',
        actingAdminId: 'admin1',
        adminCount: 1,
        targetRole: 'ADMIN',
        requestedRole: 'CUSTOMER',
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/последнего/i);
    });

    it('allows demoting another admin when others remain', () => {
      expect(
        roleChangeGuard({ ...base, adminCount: 2, targetRole: 'ADMIN', requestedRole: 'CUSTOMER' }).ok,
      ).toBe(true);
    });
  });
});
