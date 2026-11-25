import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ALL_POLICY_DOC_SLUGS,
  POLICY_DOC_SLUGS,
  foldVietnameseText,
  getAllKnowledgeChunks,
  getKnowledgeRetriever,
  getPolicyDocument,
  getPolicyDocumentByRoute,
  listPolicySummaries,
  searchKnowledge,
} from '../src/index.js';

describe('@dirtfit/knowledge Bilingual Policy Store & BM25 Retriever', () => {
  it('loads all 4 documents in EN & VI with 100% matching sectionId parity and non-empty chunks', () => {
    const enSummaries = listPolicySummaries('en');
    const viSummaries = listPolicySummaries('vi');

    expect(enSummaries).toHaveLength(ALL_POLICY_DOC_SLUGS.length);
    expect(viSummaries).toHaveLength(ALL_POLICY_DOC_SLUGS.length);

    for (const slug of ALL_POLICY_DOC_SLUGS) {
      const enDoc = getPolicyDocument(slug, 'en');
      const viDoc = getPolicyDocument(slug, 'vi');

      expect(enDoc.locale).toBe('en');
      expect(viDoc.locale).toBe('vi');
      expect(enDoc.sections.length).toBeGreaterThanOrEqual(4);
      expect(viDoc.sections.length).toBe(enDoc.sections.length);

      const enIds = enDoc.sections.map((s) => s.sectionId);
      const viIds = viDoc.sections.map((s) => s.sectionId);
      expect(viIds).toEqual(enIds);
      expect(new Set(enIds).size).toBe(enIds.length);

      for (const sec of [...enDoc.sections, ...viDoc.sections]) {
        expect(sec.heading.trim().length).toBeGreaterThan(3);
        expect(sec.body.trim().length).toBeGreaterThan(40);
        expect(sec.snippet.trim().length).toBeGreaterThan(20);
        expect(sec.blocks.length).toBeGreaterThanOrEqual(1);
        expect(sec.url).toBe(`${enDoc.publicPath}#${sec.sectionId}`);
      }
    }

    expect(getPolicyDocumentByRoute('ordering', 'en')?.slug).toBe(
      POLICY_DOC_SLUGS.ORDERING_AND_DEPOSIT
    );
    expect(getPolicyDocumentByRoute('unknown-policy', 'en')).toBeNull();
    expect(getAllKnowledgeChunks().length).toBe(
      getAllKnowledgeChunks('en').length + getAllKnowledgeChunks('vi').length
    );
  });

  it('retrieves accurate sections across English, accented Vietnamese, and unaccented Vietnamese queries', () => {
    const retriever = getKnowledgeRetriever();
    expect(retriever.size).toBeGreaterThanOrEqual(30);

    // 1. English COD question
    const enCodHits = searchKnowledge('can I pay COD for a motorcycle?', {
      locale: 'en',
      topK: 3,
    });
    expect(enCodHits.length).toBeGreaterThan(0);
    expect(enCodHits[0].docSlug).toBe(POLICY_DOC_SLUGS.ORDERING_AND_DEPOSIT);
    expect(enCodHits[0].sectionId).toBe('cod-policy');
    expect(enCodHits[0].url).toBe('/policies/ordering#cod-policy');

    // 2. Accented Vietnamese reservation hold question
    const viHoldAccentedHits = searchKnowledge('đặt cọc giữ chỗ bao lâu?', {
      locale: 'vi',
      topK: 3,
    });
    expect(viHoldAccentedHits.length).toBeGreaterThan(0);
    expect(viHoldAccentedHits[0].docSlug).toBe(POLICY_DOC_SLUGS.ORDERING_AND_DEPOSIT);
    expect(viHoldAccentedHits[0].sectionId).toBe('inventory-hold-ttl');
    expect(viHoldAccentedHits[0].url).toBe('/policies/ordering#inventory-hold-ttl');

    // 3. Unaccented Vietnamese reservation hold question
    const viHoldUnaccentedHits = searchKnowledge('dat coc giu cho bao lau', {
      locale: 'vi',
      topK: 3,
    });
    expect(viHoldUnaccentedHits.length).toBeGreaterThan(0);
    expect(viHoldUnaccentedHits[0].docSlug).toBe(POLICY_DOC_SLUGS.ORDERING_AND_DEPOSIT);
    expect(viHoldUnaccentedHits[0].sectionId).toBe('inventory-hold-ttl');

    // 4. Unaccented Vietnamese motorcycle warranty question
    const viWarrantyHits = searchKnowledge('bao hanh xe cao cao', {
      locale: 'vi',
      topK: 3,
    });
    expect(viWarrantyHits.length).toBeGreaterThan(0);
    expect(viWarrantyHits[0].docSlug).toBe(POLICY_DOC_SLUGS.WARRANTY_AND_RETURNS);
    expect(viWarrantyHits[0].sectionId).toBe('motorcycle-warranty');

    // 5. English & Vietnamese Rider-Fit FAQ queries
    const enFitHits = searchKnowledge('seat width wrap loss tenere 700 sag', {
      locale: 'en',
      topK: 3,
    });
    expect(enFitHits[0].docSlug).toBe(POLICY_DOC_SLUGS.RIDER_FIT_FAQ);

    expect(foldVietnameseText('Đặt cọc xe cào cào ở Thủ Đức')).toBe('dat coc xe cao cao o thu duc');
  });

  it('keeps src/constants.js 100% client-safe without node:fs imports', () => {
    const constantsSrc = fs.readFileSync(new URL('../src/constants.js', import.meta.url), 'utf8');
    expect(constantsSrc).not.toContain('node:fs');
    expect(constantsSrc).not.toContain("from 'fs'");
  });
});
