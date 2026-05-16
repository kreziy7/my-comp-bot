// Service so'rovi wizard scene'i — jismoniy yoki yuridik shaxs.
// Yuridik bo'lsa STIR (INN) orqali orginfo.uz'dan kompaniya ma'lumotini tortadi.

const { Scenes, Markup } = require('telegraf');
const { t } = require('../utils/format');
const { mainMenu } = require('../keyboards/main');
const { fetchOrgByInn } = require('../orginfo');
const db = require('../db');
const cfg = require('../config');

const PHONE_RE = /^\+?\d[\d\s\-()]{8,18}\d$/;
const INN_RE = /^\d{9}$/;

// Back-button labels in every supported language so wizard steps can
// detect "go back" regardless of the user's current language.
const BACK_LABELS = new Set([t('uz', 'back'), t('ru', 'back')]);
function isBack(ctx) {
  const txt = (ctx.message?.text || '').trim();
  return txt && BACK_LABELS.has(txt);
}

function normalizeInn(raw) {
  return String(raw || '').replace(/\D/g, '');
}

// Strip Markdown-special chars so values from external sources (orginfo.uz)
// can be safely interpolated into messages using parse_mode: 'Markdown'.
function md(s) {
  return String(s ?? '').replace(/[`*_\[\]]/g, '').trim();
}

const serviceScene = new Scenes.WizardScene(
  'service',
  // Step 0 — initialized via ctx.scene.enter('service', { kind: 'individual' | 'legal' })
  async (ctx) => {
    const kind = ctx.scene.state?.kind || 'individual';
    ctx.wizard.state.data = { kind };

    if (kind === 'legal') {
      await ctx.reply(ctx.t('svc_legal_intro'), { parse_mode: 'Markdown' });
      await ctx.reply(ctx.t('svc_ask_inn'),
        Markup.keyboard([[ctx.t('back')]]).oneTime().resize());
      return ctx.wizard.selectStep(1); // → INN step
    }
    // individual
    await ctx.reply(ctx.t('svc_ind_intro'), { parse_mode: 'Markdown' });
    await ctx.reply(ctx.t('svc_ask_contact_name'),
      Markup.keyboard([[ctx.t('back')]]).oneTime().resize());
    return ctx.wizard.selectStep(3); // → name step
  },

  // Step 1 — INN entry (legal only)
  async (ctx) => {
    if (!ctx.message?.text) return;
    if (isBack(ctx)) {
      await ctx.reply(ctx.t('main_menu'), mainMenu(ctx.lang));
      return ctx.scene.leave();
    }
    const inn = normalizeInn(ctx.message.text);
    if (!INN_RE.test(inn)) {
      await ctx.reply(ctx.t('svc_inn_invalid'));
      return;
    }
    await ctx.reply(ctx.t('svc_inn_searching'));
    let org;
    try {
      org = await fetchOrgByInn(inn);
    } catch (e) {
      console.error('[orginfo]', e.message);
      org = null;
    }
    if (!org) {
      await ctx.reply(ctx.t('svc_inn_not_found'), Markup.inlineKeyboard([
        [Markup.button.callback(ctx.t('svc_btn_manual_inn'), 'svc:inn:manual')],
      ]));
      ctx.wizard.state.data.inn = inn; // remember entered INN for manual path
      return; // stay on same step
    }
    ctx.wizard.state.data.inn = inn;
    ctx.wizard.state.data.org = org;
    const text = ctx.t('svc_inn_confirm', {
      name: md(org.legalName || org.name),
      inn: md(org.inn),
      director: md(org.directorName) || '—',
      address: md([org.locality, org.address].filter(Boolean).join(', ')) || '—',
      phone: md(org.telephone) || '—',
      email: md(org.email) || '—',
    });
    await ctx.reply(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback(ctx.t('svc_btn_confirm'), 'svc:org:yes')],
        [Markup.button.callback(ctx.t('svc_btn_reject'), 'svc:org:no')],
      ]),
    });
    return ctx.wizard.next(); // → step 2: org confirmation
  },

  // Step 2 — org confirmation (legal only) — handled via action handlers below.
  async (ctx) => {
    // Fallback if user sends text instead of clicking button
    await ctx.reply(ctx.t('svc_inn_confirm', {
      name: md(ctx.wizard.state.data.org?.legalName) || '—',
      inn: md(ctx.wizard.state.data.org?.inn) || '—',
      director: md(ctx.wizard.state.data.org?.directorName) || '—',
      address: '—',
      phone: '—',
      email: '—',
    }), {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback(ctx.t('svc_btn_confirm'), 'svc:org:yes')],
        [Markup.button.callback(ctx.t('svc_btn_reject'), 'svc:org:no')],
      ]),
    });
  },

  // Step 3 — contact name (both branches)
  async (ctx) => {
    if (!ctx.message?.text) return;
    if (isBack(ctx)) {
      // Legal flow → back to INN; individual flow → leave scene.
      if (ctx.wizard.state.data.kind === 'legal') {
        await ctx.reply(ctx.t('svc_ask_inn'),
          Markup.keyboard([[ctx.t('back')]]).oneTime().resize());
        return ctx.wizard.selectStep(1);
      }
      await ctx.reply(ctx.t('main_menu'), mainMenu(ctx.lang));
      return ctx.scene.leave();
    }
    ctx.wizard.state.data.full_name = ctx.message.text.trim().slice(0, 100);
    await ctx.reply(ctx.t('svc_ask_phone'),
      Markup.keyboard([
        [Markup.button.contactRequest(ctx.t('svc_send_contact'))],
        [ctx.t('back')],
      ]).oneTime().resize());
    return ctx.wizard.next();
  },

  // Step 4 — phone
  async (ctx) => {
    if (isBack(ctx)) {
      await ctx.reply(ctx.t('svc_ask_contact_name'),
        Markup.keyboard([[ctx.t('back')]]).oneTime().resize());
      return ctx.wizard.selectStep(3);
    }
    let phone = null;
    if (ctx.message?.contact?.phone_number) phone = ctx.message.contact.phone_number;
    else if (ctx.message?.text && PHONE_RE.test(ctx.message.text.trim())) {
      phone = ctx.message.text.trim();
    }
    if (!phone) { await ctx.reply(ctx.t('svc_invalid_phone')); return; }
    ctx.wizard.state.data.phone = phone;
    await ctx.reply(ctx.t('svc_ask_device'),
      Markup.keyboard([
        [ctx.t('svc_btn_pc'), ctx.t('svc_btn_laptop')],
        [ctx.t('svc_btn_cartridge'), ctx.t('svc_btn_monitor')],
        [ctx.t('svc_btn_other')],
        [ctx.t('back')],
      ]).oneTime().resize());
    return ctx.wizard.next();
  },

  // Step 5 — device type → straight to summary
  async (ctx) => {
    if (!ctx.message?.text) return;
    if (isBack(ctx)) {
      await ctx.reply(ctx.t('svc_ask_phone'),
        Markup.keyboard([
          [Markup.button.contactRequest(ctx.t('svc_send_contact'))],
          [ctx.t('back')],
        ]).oneTime().resize());
      return ctx.wizard.selectStep(4);
    }
    ctx.wizard.state.data.device_type = ctx.message.text.trim().replace(/^[^\p{L}\p{N}]+/u, '').slice(0, 60);
    ctx.wizard.state.data.device_model = null;
    ctx.wizard.state.data.problem = null;
    const d = ctx.wizard.state.data;
    const summary = ctx.t('svc_confirm', {
      name: md(d.full_name),
      phone: md(d.phone),
      device: md(d.device_type),
    });
    await ctx.reply(summary, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback(ctx.t('svc_btn_confirm_send'), 'svc:final:yes')],
        [Markup.button.callback(ctx.t('svc_btn_cancel'), 'svc:final:no')],
      ]),
    });
    return ctx.wizard.next();
  },

  // Step 6 — wait for final confirmation (handled by action)
  async (ctx) => {
    await ctx.reply(ctx.t('svc_confirm', ctx.wizard.state.data ?? {}));
  },

  // Step 7 — manual legalName entry (when orginfo lookup failed)
  async (ctx) => {
    if (!ctx.message?.text) return;
    if (isBack(ctx)) {
      await ctx.reply(ctx.t('svc_ask_inn'),
        Markup.keyboard([[ctx.t('back')]]).oneTime().resize());
      return ctx.wizard.selectStep(1);
    }
    const legalName = ctx.message.text.trim().slice(0, 150);
    if (legalName.length < 2) {
      await ctx.reply(ctx.t('svc_ask_legal_name_manual'));
      return;
    }
    ctx.wizard.state.data.org = {
      inn: ctx.wizard.state.data.inn || null,
      name: legalName,
      legalName,
      email: null,
      telephone: null,
      address: null,
      locality: null,
      foundingDate: null,
      directorName: null,
      orginfoId: null,
      orginfoUrl: null,
    };
    await ctx.reply(ctx.t('svc_ask_contact_name'));
    return ctx.wizard.selectStep(3);
  }
);

// ─── Scene-scoped actions ────────────────────────────────────────────────────
serviceScene.action('svc:org:no', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.wizard.state.data.org = null;
  ctx.wizard.state.data.inn = null;
  await ctx.reply(ctx.t('svc_ask_inn'));
  return ctx.wizard.selectStep(1);
});

serviceScene.action('svc:org:yes', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(ctx.t('svc_ask_contact_name'),
    Markup.keyboard([[ctx.t('back')]]).oneTime().resize());
  return ctx.wizard.selectStep(3);
});

// Manual fallback when orginfo lookup fails — ask user to type company name.
serviceScene.action('svc:inn:manual', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(ctx.t('svc_ask_legal_name_manual'),
    Markup.keyboard([[ctx.t('back')]]).oneTime().resize());
  return ctx.wizard.selectStep(7); // dedicated manual-name step
});

serviceScene.action('svc:final:no', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(ctx.t('svc_cancelled'), mainMenu(ctx.lang));
  return ctx.scene.leave();
});

serviceScene.action('svc:final:yes', async (ctx) => {
  await ctx.answerCbQuery();
  const d = ctx.wizard.state.data;
  try {
    let customerId = null;
    if (db.isEnabled()) {
      const extra = {
        full_name: d.full_name,
        phone: d.phone,
        customer_type: d.kind === 'legal' ? 'legal' : 'individual',
      };
      if (d.org) {
        extra.legal_name = d.org.legalName;
        extra.company_name = d.org.name;
        extra.inn = d.org.inn;
        extra.director_name = d.org.directorName;
        extra.company_email = d.org.email;
        extra.company_phone = d.org.telephone;
        extra.company_address = [d.org.locality, d.org.address].filter(Boolean).join(', ') || null;
        extra.founding_date = d.org.foundingDate;
        extra.orginfo_id = d.org.orginfoId;
      }
      customerId = await db.upsertCustomer(ctx.from, extra);
      const req = await db.createServiceRequest({
        customerId,
        deviceType: d.device_type,
        deviceModel: d.device_model || '—',
        problemDescription: d.problem || '—',
      });
      ctx.wizard.state.data.requestNumber = req.request_number;
    }
    const num = ctx.wizard.state.data.requestNumber || Math.floor(Math.random() * 9000 + 1000);
    await ctx.reply(ctx.t('svc_done', { id: num }), { parse_mode: 'Markdown', ...mainMenu(ctx.lang) });

    // Notify admin
    if (cfg.adminChatId) {
      const lines = [
        `🔧 *Yangi service so'rovi #${num}*`,
        '',
        d.kind === 'legal' ? `🏢 *Yuridik shaxs*` : `👤 *Jismoniy shaxs*`,
        d.org ? `🏢 ${md(d.org.legalName)}` : '',
        d.org ? `🔢 STIR: \`${md(d.org.inn)}\`` : '',
        '',
        `👤 *Ism:* ${md(d.full_name)}`,
        `📱 *Telefon:* ${md(d.phone)}`,
        `💻 *Qurilma:* ${md(d.device_type)}`,
      ].filter(Boolean).join('\n');
      try {
        await ctx.telegram.sendMessage(cfg.adminChatId, lines, { parse_mode: 'Markdown' });
      } catch (e) {
        console.warn('[service] admin notify failed:', e.message);
      }
    }
  } catch (e) {
    console.error('[service] save failed:', e);
    await ctx.reply(ctx.t('error_generic'), mainMenu(ctx.lang));
  }
  return ctx.scene.leave();
});

module.exports = { serviceScene };
