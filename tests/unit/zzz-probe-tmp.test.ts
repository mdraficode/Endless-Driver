import { describe, expect, it } from 'vitest';
import { ROAD_NETWORK_CONFIG, AOHARA_BOULEVARD_JUNCTIONS, aoharaBoulevardDistanceMeters } from '../../src/config/roads';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { AOHARA_DISTRICT_CONFIG } from '../../src/config/urban-district';
import { createWorldTerrainSampler } from '../../src/world/world-terrain';

describe('tmp probe', () => {
  it('graph', () => {
    const network = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG).roadNetwork;
    if (!network) throw new Error('no network');
    const cx = AOHARA_DISTRICT_CONFIG.centerX, cz = AOHARA_DISTRICT_CONFIG.centerZ;
    const aohara = [...network.nodes.values()].filter((n) => n.id.startsWith('aohara-'));
    const grid = aohara.filter((n) => !n.id.startsWith('aohara-access-') && !n.id.includes('-backstreet-') && !n.id.startsWith('aohara-boulevard-'));
    const access = aohara.filter((n) => n.id.startsWith('aohara-access-'));
    const internal = aohara.filter((n) => n.id.includes('-backstreet-'));
    const boulevard = aohara.filter((n) => n.id.startsWith('aohara-boulevard-'));
    const urban = network.edges.filter((e) => e.roadClass === 'urban-local' || e.roadClass === 'urban-arterial');
    const arterial = urban.filter((e) => e.roadClass === 'urban-arterial');
    const local = urban.filter((e) => e.roadClass === 'urban-local');
    const alleys = network.edges.filter((e) => e.roadClass === 'urban-alley');
    // reachability
    const visited = new Set(['spawn-junction']);
    const queue = ['spawn-junction'];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      for (const next of network.neighboursOf(nodeId)) {
        if (!visited.has(next)) { visited.add(next); queue.push(next); }
      }
    }
    const lineDist = (n: { x: number; z: number }) => Math.abs(aoharaBoulevardDistanceMeters(n.x, n.z));
    console.log(JSON.stringify({
      aohara: aohara.length, grid: grid.length, access: access.length, internal: internal.length,
      boulevard: boulevard.length, junctionLineDist: AOHARA_BOULEVARD_JUNCTIONS.map((j) => lineDist(j).toFixed(4)).join(','),
      totalNodes: network.nodes.size, urban: urban.length, arterial: arterial.length, local: local.length,
      alleys: alleys.length, totalEdges: network.edges.length, reachable: `${visited.size}/${network.nodes.size}`,
      shortStreetStubs: local.filter((e) => e.lengthMeters < 45).map((e) => e.lengthMeters.toFixed(2)).join(','),
      a1len: network.edges.find((e) => e.id === 'aohara-south-outer-east-outer->aohara-boulevard-east')?.lengthMeters.toFixed(1),
    }));
    expect(true).toBe(true);
  });
});
