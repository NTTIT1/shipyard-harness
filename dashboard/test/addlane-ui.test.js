// "Thêm lane": which projects a lane can be added for — only those the platform still has.
import { describe, it, expect } from 'vitest';
import { laneProjectOptions } from '../src/lib/laneview.js';

describe('add lane — projects', () => {
  const local = [{ slug: 'web-hoc', name: 'Web học', stack: 'ts-nestjs + ts-react-vite', supported: true },
    { slug: 'vay-online', name: 'Vay online', stack: 'java-spring', supported: true },
    { slug: 'du-an-da-xoa', name: 'Đã xoá', stack: 'x', supported: true }];
  const reg = [{ id: 'proj_hrm', slug: 'hrm-gms', name: 'HRM-GMS' }, { id: 'proj_hoc', slug: 'web-hoc', name: 'Web học online' }, { id: 'proj_vay', slug: 'vay-online', name: 'Vay online' }];
  it('lists the main project and the registered ones; a project deleted on the platform is gone', () => {
    const o = laneProjectOptions(local, reg, 'proj_hrm');
    expect(o.map(x => [x.slug, x.name, x.projectId, !!x.main])).toEqual([
      ['', 'HRM-GMS', 'proj_hrm', true], ['vay-online', 'Vay online', 'proj_vay', false], ['web-hoc', 'Web học online', 'proj_hoc', false]]);
  });
  it('without a known main project it still offers the machine default', () => {
    expect(laneProjectOptions([], [], '')).toEqual([{ slug: '', name: 'Dự án chính của máy này', projectId: '', main: true, supported: true, stack: '' }]);
  });
});
