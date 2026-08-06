(function () {
  'use strict';

  var data;
  var tab = 'all';
  var wishFilter = 'pending';
  var financeFilter = 'note';
  var spendCategoryFilter = 'all';
  var recordDesc = true;
  var visibleRecords = 20;
  var $ = function (id) { return document.getElementById(id); };
  var round = function (v) { return Math.round((Number(v) || 0) * 100) / 100; };
  var money = function (v) { return round(v).toFixed(2); };
  var stamp = function () { return new Date().toISOString(); };
  var today = function () { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  var uid = function (p) { return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };
  var esc = function (v) { return String(v || '').replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); };
  var modal = function (id, open) { $(id).classList.toggle('active', open); };
  var ACCOUNT_META = {
    naya: { label: 'Naya余额', icon: '💛' },
    nathan: { label: 'Nathan余额', icon: '💙' },
    bank: { label: '银行', icon: '🏦' }
  };

  function defaultNotification() {
    return { enabled: true, character_name: 'Nathan', chat_id: '6de0fd77-c098-4bd5-b09e-ebb099a3fd98', chat_title: '猫猫狗狗⑤', character_card_id: '5da8ed5b-7feb-4279-8f3d-56d5db743f83' };
  }

  function save() {
    var result = JSON.parse(FundHost.writeData(JSON.stringify(data)));
    if (!result.success) alert(result.message || '保存失败');
    return result.success;
  }

  async function notify(kind, detail) {
    if (!data.notification || !data.notification.enabled) return;
    try {
      await Promise.resolve(FundHost.sendNotification(JSON.stringify({ settings: data.notification, message: '【Nathan基金】' + kind + '\n' + detail })));
    } catch (e) { console.log('[NathanFund] notification failed', e); }
  }

  function normalize() {
    data.accounts = data.accounts || {
      naya: { label: 'Naya余额', icon: '💛', balance: 616.36 },
      nathan: { label: 'Nathan余额', icon: '💙', balance: 141.84 },
      bank: { label: '银行', icon: '🏦', balance: 981.53 }
    };
    Object.keys(ACCOUNT_META).forEach(function (key) {
      data.accounts[key] = Object.assign({}, ACCOUNT_META[key], data.accounts[key] || {});
      data.accounts[key].balance = round(data.accounts[key].balance);
    });
    data.salary_settings = data.salary_settings || { enabled: true, amount: 5 };
    data.wishes = data.wishes || [];
    data.wishes.forEach(function(w, i) { if (w.sort_order == null) w.sort_order = i; if (!w.reviews) w.reviews = []; });
    data.wish_categories = data.wish_categories || [];
    data.spend_categories = data.spend_categories || [];
    data.penalties = data.penalties || [];
    data.income = data.income || [];
    data.treats = data.treats || [];
    data.finance_notes = data.finance_notes || [];
    data.allocation = data.allocation || {};
    data.allocation.transactions = data.allocation.transactions || [];
    data.notification = Object.assign(defaultNotification(), data.notification || {});
    // bank_products 初始化
    if (!data.bank_products) {
      var bbal = round(data.accounts.bank.balance);
      data.bank_products = [
        { id: 'bp_anxincun', name: '安心攒', type: 'current', principal: round(bbal/2), annual_rate: 0.012, settle_cycle: 'daily', settle_day: null, accumulated_interest: 0, last_settled_date: today(), note: '活期，日日计息，年化约1.2%' },
        { id: 'bp_zhouzhouying', name: '周周盈', type: 'weekly', principal: round(bbal/2), annual_rate: 0.017, settle_cycle: 'weekly', settle_day: 2, accumulated_interest: 0, last_settled_date: today(), note: '每周二结算，近1月年化约1.7%' }
      ];
    }
    settleBankInterest();
    data.allocation.last_salary_date = data.allocation.last_salary_date || data.allocation.last_rebalance || today();
    data.wishes.forEach(function (w) {
      if (w.budget_min == null && w.budget != null) w.budget_min = Number(w.budget);
      if (w.budget_max == null && w.budget != null) w.budget_max = Number(w.budget);
    });
    syncLegacy();
  }

  function settleBankInterest() {
    if (!data.bank_products || !data.bank_products.length) return;
    var t = today();
    data.bank_products.forEach(function (p) {
      if (!p.principal || !p.annual_rate) return;
      var last = p.last_settled_date || t;
      if (p.settle_cycle === 'daily') {
        var days = Math.max(0, Math.floor((new Date(t+'T00:00:00') - new Date(last+'T00:00:00')) / 86400000));
        if (days > 0) {
          var interest = round(p.principal * p.annual_rate / 365 * days);
          p.accumulated_interest = round((p.accumulated_interest || 0) + interest);
          p.last_interest_amount = interest;
          p.last_settled_date = t;
        }
      } else if (p.settle_cycle === 'weekly') {
        // 找上一个周二
        var now = new Date(t+'T00:00:00');
        var dow = now.getDay(); // 0=Sun
        var daysToLastTue = (dow >= 2) ? dow - 2 : dow + 5;
        var lastTue = new Date(now.getTime() - daysToLastTue*86400000);
        var lastTueStr = lastTue.toISOString().slice(0,10);
        if (lastTueStr > last) {
          var weeks = Math.floor(daysBetween(last, lastTueStr) / 7);
          if (weeks > 0) {
            var wInterest = round(p.principal * p.annual_rate / 52 * weeks);
            p.accumulated_interest = round((p.accumulated_interest || 0) + wInterest);
            p.last_interest_amount = wInterest;
            p.last_settled_date = lastTueStr;
          }
        }
      }
    });
    // 总利息写回bank账户
    var totalInterest = round(data.bank_products.reduce(function(s,p){return s+(p.accumulated_interest||0);},0));
    data.allocation.bank_interest = totalInterest;
  }

  function syncLegacy() {
    data.allocation.bank = Object.assign({}, data.allocation.bank || {}, { total: round(data.accounts.bank.balance), naya_custody: 0, label: '银行', product_name: '不动金' });
    data.allocation.pools = data.allocation.pools || {};
    data.allocation.pools.nathan = Object.assign({}, data.allocation.pools.nathan || {}, { balance: round(data.accounts.nathan.balance), label: 'Nathan余额', icon: '💙' });
  }

  function daysBetween(from, to) {
    return Math.max(0, Math.floor((new Date(to + 'T00:00:00') - new Date(from + 'T00:00:00')) / 86400000));
  }

  function accountChange(key, amount, type, note, date, extra) {
    var account = data.accounts[key];
    account.balance = round(account.balance + amount);
    account.last_changed_at = stamp();
    data.allocation.transactions.push(Object.assign({ id: uid('tx'), date: date || today(), time: stamp(), type: type, account: key, pool: key, amount: round(amount), note: note || '' }, extra || {}));
    syncLegacy();
  }

  function settleSalary() {
    var settings = data.salary_settings || { enabled: true, amount: 5 };
    if (!settings.enabled) return false;
    var last = data.allocation.last_salary_date || today();
    var days = daysBetween(last, today());
    if (!days) return false;
    var dailyAmount = Number(settings.amount) || 5;
    var salary = round(days * dailyAmount);
    var nathanPart = round(days * (dailyAmount * 0.9));
    var bankPart = round(days * (dailyAmount * 0.1));
    accountChange('naya', -salary, 'salary_transfer', '日薪 ' + days + ' 天', today(), { salary_role: 'source' });
    accountChange('nathan', nathanPart, 'salary_transfer', '日薪 ' + days + ' 天', today(), { salary_role: 'nathan' });
    accountChange('bank', bankPart, 'salary_transfer', '日薪 ' + days + ' 天', today(), { salary_role: 'bank' });
    data.allocation.last_salary_date = today();
    data.allocation.last_rebalance = today();
    return true;
  }

  function totalAssets() {
    return round(data.accounts.naya.balance + data.accounts.nathan.balance + data.accounts.bank.balance);
  }

  function totalSpent() {
    var oldFund = data.treats.reduce(function (sum, x) { return sum + Number(x.amount || 0); }, 0);
    var nayaExpense = data.allocation.transactions.filter(function (x) { return x.type === 'naya_expense'; }).reduce(function (sum, x) { return sum + Math.abs(Number(x.amount || 0)); }, 0);
    var newExpense = data.allocation.transactions.filter(function (x) { return x.type === 'account_expense' || x.type === 'bank_expense'; }).reduce(function (sum, x) { return sum + Math.abs(Number(x.amount || 0)); }, 0);
    return round(Number(data.initial_treat_total || 0) + oldFund + nayaExpense + newExpense);
  }

  function init(incoming) {
    if (!incoming || typeof incoming !== 'object') return;
    data = incoming;
    normalize();
    if (settleSalary()) save();
    render();
  }

  window.__onFundDataReady__ = init;
  try { if (window.__FUND_DATA__) init(window.__FUND_DATA__); } catch (e) {}
  setTimeout(function () { try { var r = JSON.parse(FundHost.readData()); if (r.success) init(r.data); } catch (e) {} }, 200);

  function render() {
    if (!data) return;
    var elapsedDays = daysBetween(data.start_date || today(), today());
    var pending = data.wishes.filter(function (w) { return w.status === 'pending'; });
    $('balance').textContent = '¥' + money(totalAssets());
    $('coupleAccounts').innerHTML = '<button class="couple-account-card" data-account="naya"><span class="account-name">💛 Naya余额</span><strong>¥' + money(data.accounts.naya.balance) + '</strong><small>余额宝 · 点击查看流水</small></button>' +
      '<button class="couple-account-card" data-account="nathan"><span class="account-name">💙 Nathan余额</span><strong>¥' + money(data.accounts.nathan.balance) + '</strong><small>Nathan小荷包 · 点击查看流水</small></button>';
    // 银行区域：显示产品明细
    var bankHtml = '<span><b>' + ACCOUNT_META.bank.icon + ' ' + ACCOUNT_META.bank.label + '</b><small>';
    if (data.bank_products && data.bank_products.length) {
      bankHtml += data.bank_products.map(function(p){
        var intStr = p.accumulated_interest ? ' · 累计收益¥'+money(p.accumulated_interest) : '';
        var rateStr = (p.annual_rate*100).toFixed(1)+'%年化';
        return p.name+'('+rateStr+intStr+')';
      }).join(' / ');
    } else { bankHtml += '点击查看流水'; }
    bankHtml += '</small></span><strong>¥' + money(data.accounts.bank.balance) + '</strong>';
    $('bankAccount').innerHTML = bankHtml;
    var salaryInfo = data.salary_settings || { enabled: true, amount: 5 };
    $('detailSecondary').textContent = '已累计 ' + elapsedDays + ' 天 · 日薪 ' + (salaryInfo.enabled ? money(salaryInfo.amount) : '已暂停') + ' · 支出 ¥' + money(totalSpent());
    $('wishSummaryText').textContent = '待完成 ' + pending.length + ' 项 · 近期 ' + pending.filter(function (w) { return w.is_recent; }).length + ' 项';
    $('wishSummaryBody').innerHTML = pending.slice(0, 3).map(function (w) { return '<div class="wish-meta">' + esc(w.title) + budgetText(w) + '</div>'; }).join('') || '<div class="wish-meta">还没有待完成的愿望</div>';
    renderHistory();
    renderWishes();
    renderFinance();
  }

  function records() {
    var result = [];
    data.penalties.forEach(function (x) { result.push({ type: 'penalty', amount: x.amount, reason: x.reason, date: x.date, time: x.time, account: x.account || 'bank' }); });
    data.income.forEach(function (x) { result.push({ type: 'income', amount: x.amount, reason: x.reason, date: x.date, time: x.time, account: x.account || '' }); });
    data.treats.forEach(function (x) { result.push({ type: 'treat', amount: x.amount, reason: x.reason, date: x.date, time: x.time, account: x.account || x.pool || '' }); });
    data.allocation.transactions.filter(function (x) { return x.type === 'naya_expense' || x.type === 'account_expense' || x.type === 'bank_expense'; }).forEach(function (x) {
      result.push({ type: 'treat', amount: Math.abs(Number(x.amount || 0)), reason: x.note || '支出', date: x.date, time: x.time, account: x.account || (x.type === 'naya_expense' ? 'naya' : x.pool), category: x.category || '' });
    });
    return result;
  }

  function renderHistory() {
    var names = { all: '全部记录', penalty: '罚金', income: '收入', treat: '支出' };
    var list = records().filter(function (x) { return tab === 'all' || x.type === tab; });
    // 支出tab下按分类筛选
    if (tab === 'treat' && spendCategoryFilter !== 'all') {
      list = list.filter(function (x) { return x.category === spendCategoryFilter; });
    }
    list.sort(function (a, b) { return recordDesc ? new Date(b.time || b.date) - new Date(a.time || a.date) : new Date(a.time || a.date) - new Date(b.time || b.date); });
    var shown = list.slice(0, visibleRecords);
    $('recordTitle').textContent = names[tab] || '全部记录';
    $('recordSort').textContent = recordDesc ? '最新在前' : '最早在前';
    // 支出tab显示分类筛选条
    var filterEl = $('spendCategoryFilters');
    if (tab === 'treat') {
      var cats = data.spend_categories || [];
      var html = '<button class="spend-cat-btn' + (spendCategoryFilter === 'all' ? ' active' : '') + '" data-scat="all">全部</button>';
      cats.forEach(function (c) {
        html += '<button class="spend-cat-btn' + (spendCategoryFilter === c.id ? ' active' : '') + '" data-scat="' + esc(c.id) + '">' + esc(c.name) + '</button>';
      });
      html += '<button class="spend-cat-btn spend-cat-manage" data-scat-manage="1">+</button>';
      filterEl.innerHTML = html;
      filterEl.hidden = false;
    } else {
      filterEl.hidden = true;
    }
    $('historyList').innerHTML = shown.length ? shown.map(function (x) {
      var meta = ACCOUNT_META[x.account];
      var catLabel = '';
      if (x.category && x.type === 'treat') {
        var catObj = (data.spend_categories || []).filter(function(c){return c.id===x.category;})[0];
        if (catObj) catLabel = ' · ' + esc(catObj.name);
      }
      return '<div class="history-item"><div class="left"><div class="reason">' + esc(x.reason) + '</div><div class="date">' + esc(x.date) + (meta ? ' · ' + meta.icon + meta.label : '') + catLabel + '</div></div><div class="amount ' + x.type + '">' + (x.type === 'treat' ? '-' : '+') + money(x.amount) + '</div></div>';
    }).join('') : '<div class="empty-hint">暂无记录</div>';
    $('historyMore').hidden = !(list.length > shown.length);
  }

  function budgetText(w) {
    var min = w.budget_min, max = w.budget_max;
    if (min != null && max != null && Number(min) !== Number(max)) return ' · ¥' + money(min) + '–' + money(max);
    var value = max != null ? max : min != null ? min : w.budget;
    return value == null ? '' : ' · ¥' + money(value);
  }

  function wishStatusLabel(status) {
    return { pending: '待完成', rejected: 'Nathan驳回', completed: '已实现', self_acquired: 'Naya已实现', dismissed: '已放下' }[status] || status;
  }

  function renderWishes() {
    var list = data.wishes.filter(function (w) {
      if (wishFilter === 'pending') return w.status === 'pending';
      if (wishFilter === 'rejected') return w.status === 'rejected';
      return w.status !== 'pending' && w.status !== 'rejected';
    }).sort(function(a,b){
      if(wishFilter==='pending') return (a.sort_order||0)-(b.sort_order||0);
      return new Date(b.created_at||b.resolved_at||0)-new Date(a.created_at||a.resolved_at||0);
    });
    $('wishCount').textContent = (wishFilter === 'pending' ? '待完成 ' : wishFilter === 'rejected' ? '已驳回 ' : '归档 ') + list.length + ' 项';
    $('wishList').innerHTML = list.length ? list.map(function (w) {
      var notes = (w.note ? '<div class="wish-note">备注：' + esc(w.note) + '</div>' : '') + (w.resolution_note ? '<div class="wish-note">处理：' + esc(w.resolution_note) + '</div>' : '');
      var sortBtns = wishFilter==='pending' ? '<div class="wish-sort-btns"><button data-wish-move="'+w.id+':up">↑</button><button data-wish-move="'+w.id+':down">↓</button></div>' : '';
      var reviewHtml = '';
      if (w.reviews && w.reviews.length) {
        reviewHtml = '<div class="wish-reviews"><div class="wish-reviews-title">Nathan的评估（' + w.reviews.length + '条）</div>' + w.reviews.map(function(r){
          return '<div class="wish-review-item"><span class="wish-review-date">' + esc(r.date) + '</span><p>' + esc(r.content) + '</p></div>';
        }).join('') + '</div>';
      }
      var actions = w.status === 'pending' ? '<div class="wish-actions"><button data-edit="' + w.id + '">编辑</button><button data-review="' + w.id + '">评估</button><button data-resolve="' + w.id + '">处理</button></div>' : w.status === 'rejected' ? '<div class="wish-actions"><button data-review="' + w.id + '">评估</button><button data-rejected-action="' + w.id + '">决定走向</button></div>' : '<div class="wish-actions"><button data-review="' + w.id + '">查看评估</button></div>';
      return '<div class="wish-card" data-wish-id="' + w.id + '"><div class="wish-top"><div><div class="wish-title">' + esc(w.title) + '</div><div class="wish-meta">' + esc(w.category_name || '未分类') + budgetText(w) + '</div></div><span class="badge">' + wishStatusLabel(w.status) + (w.is_recent ? '<br>近期' : '') + '</span>' + sortBtns + '</div>' + notes + reviewHtml + actions + '</div>';
    }).join('') : '<div class="empty-hint">这里还没有内容</div>';
  }

  function renderFinance() {
    var notes = data.finance_notes.filter(function (n) { return financeFilter === 'weekly' ? n.type === 'weekly' : n.type !== 'weekly'; }).sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    $('financeTabTitle').textContent = (financeFilter === 'weekly' ? '周报 ' : '理财笔记 ') + notes.length + ' 项';
    $('financeList').innerHTML = notes.length ? notes.map(function (n) {
      var badge = n.type === 'weekly' ? '📊 周报' : '📋 理财笔记';
      return '<button class="finance-entry" data-note="' + n.id + '"><div class="finance-entry-top"><span class="finance-badge ' + (n.type === 'weekly' ? 'weekly' : 'note') + '">' + badge + '</span><span class="date">' + esc(n.date) + '</span></div><div class="wish-title">' + esc(n.title) + '</div><p>' + esc(n.content || '') + '</p>' + (n.naya_comment ? '<div class="naya-reply">💬 Naya：' + esc(n.naya_comment) + '</div>' : '') + '</button>';
    }).join('') : '<div class="empty-hint">还没有记录</div>';
  }

  function fillCategories(selected) {
    $('wishCategory').innerHTML = '<option value="">请选择合集</option>' + data.wish_categories.map(function (c) { return '<option value="' + esc(c.name) + '">' + esc(c.name) + '</option>'; }).join('');
    $('wishCategory').value = selected || '';
  }

  function renderCategories() {
    $('categoryList').innerHTML = data.wish_categories.length ? data.wish_categories.map(function (c) { var used = data.wishes.some(function (w) { return w.category_name === c.name; }); return '<div class="category-row"><span>' + esc(c.name) + '</span>' + (used ? '<small>使用中</small>' : '<button data-delete-category="' + c.id + '">删除</button>') + '</div>'; }).join('') : '<div class="empty-hint">还没有合集</div>';
  }

  function fillSpendCategories(selected) {
    var cats = data.spend_categories || [];
    $('spendCategory').innerHTML = '<option value="">不分类</option>' + cats.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('');
    $('spendCategory').value = selected || '';
  }

  function renderSpendCategories() {
    var cats = data.spend_categories || [];
    var txs = data.allocation.transactions || [];
    $('spendCategoryList').innerHTML = cats.length ? cats.map(function (c) {
      var used = txs.some(function (t) { return t.category === c.id; });
      return '<div class="category-row"><span>' + esc(c.name) + '</span>' + (used ? '<small>使用中</small>' : '<button data-delete-spend-category="' + c.id + '">删除</button>') + '</div>';
    }).join('') : '<div class="empty-hint">还没有分类</div>';
  }

  function openWish(w) {
    $('wishModalTitle').textContent = w ? '编辑愿望' : '新增愿望';
    $('wishId').value = w ? w.id : '';
    $('wishTitle').value = w ? w.title : '';
    fillCategories(w ? w.category_name : '');
    $('wishBudgetMin').value = w && w.budget_min != null ? w.budget_min : '';
    $('wishBudgetMax').value = w && w.budget_max != null ? w.budget_max : '';
    $('wishRecent').checked = !!(w && w.is_recent);
    $('wishNote').value = w ? w.note || '' : '';
    modal('wishModal', true);
  }

  function saveWish() {
    var title = $('wishTitle').value.trim();
    var category = $('wishCategory').value.trim();
    var min = $('wishBudgetMin').value === '' ? null : Number($('wishBudgetMin').value);
    var max = $('wishBudgetMax').value === '' ? null : Number($('wishBudgetMax').value);
    if (!title || !category) return alert('请填写名称并选择合集');
    if (min != null && max != null && min > max) return alert('预算最低值不能高于最高值');
    var w = data.wishes.filter(function (x) { return x.id === $('wishId').value; })[0];
    var isNew = !w;
    if (!w) { w = { id: uid('wish'), status: 'pending', priority: 'medium', created_at: stamp() }; data.wishes.push(w); }
    Object.assign(w, { title: title, category_name: category, budget_min: min, budget_max: max, budget: max != null ? max : min, is_recent: $('wishRecent').checked, note: $('wishNote').value.trim(), updated_at: stamp() });
    if (save()) { modal('wishModal', false); render(); if (isNew) notify('新愿望', 'Naya发布了愿望「' + title + '」' + budgetText(w)); }
  }

  function openResolve(w, defaultStatus) {
    $('resolveWishId').value = w.id;
    $('resolveStatus').value = defaultStatus || 'completed';
    $('resolvePool').value = defaultStatus === 'self_acquired' ? 'naya' : 'nathan';
    $('resolveAmount').value = '';
    $('resolveReason').value = '';
    $('resolveNote').value = '';
    updateResolveFields();
    modal('resolveModal', true);
  }

  function updateResolveFields() {
    var status = $('resolveStatus').value;
    $('expenseFields').style.display = status === 'completed' || status === 'self_acquired' ? 'block' : 'none';
    if (status === 'self_acquired') $('resolvePool').value = 'naya';
  }

  function resolveWish() {
    var w = data.wishes.filter(function (x) { return x.id === $('resolveWishId').value; })[0];
    if (!w) return;
    var status = $('resolveStatus').value;
    if (status === 'completed' || status === 'self_acquired') {
      var amount = round(Number($('resolveAmount').value));
      var account = $('resolvePool').value;
      if (!(amount > 0)) return alert('请填写实际花费');
      if (amount > data.accounts[account].balance) return alert(ACCOUNT_META[account].label + '余额不足');
      var reason = $('resolveReason').value.trim() || ('愿望实现：' + w.title);
      accountChange(account, -amount, 'account_expense', reason, today(), { category: 'wish', wish_id: w.id });
      w.actual_amount = amount;
      w.actual_account = account;
      w.expense_reason = reason;
    }
    w.status = status;
    w.resolved_at = stamp();
    w.resolution_note = $('resolveNote').value.trim();
    if (save()) {
    modal('resolveModal', false); render();
    var notifyTitle = status === 'rejected' ? 'Nathan驳回了愿望' : status === 'completed' ? 'Nathan实现了愿望🎉' : status === 'self_acquired' ? 'Naya自己实现了愿望' : '愿望状态更新';
    var notifyDetail = '「' + w.title + '」' + (w.actual_amount ? ' · 实际花费¥' + money(w.actual_amount) : '') + (w.resolution_note ? '\n备注：' + w.resolution_note : '');
    notify(notifyTitle, notifyDetail);
  }
  }

  function openRejectedAction(w) {
    $('rejectedWishId').value = w.id;
    $('rejectedWishName').textContent = '「' + w.title + '」';
    modal('rejectedActionModal', true);
  }

  function saveEntry() {
    var type = $('entryType').value;
    var amount = round(Number($('entryAmount').value));
    var account = $('entryPool').value;
    var reason = $('entryReason').value.trim() || (type === 'penalty' ? '罚金' : '收入');
    var date = $('entryDate').value || today();
    if (!(amount > 0)) return alert('请输入有效金额');
    if (type === 'penalty') {
      var target = $('penaltyTarget').value;
      if (target === 'nathan') {
        if (amount > data.accounts.nathan.balance) return alert('Nathan余额不足（当前¥' + money(data.accounts.nathan.balance) + '）');
        accountChange('nathan', -amount, 'nathan_penalty', reason, date, { penalty_direction: 'nathan_to_bank' });
        accountChange('bank', amount, 'nathan_penalty', reason, date, { penalty_direction: 'nathan_to_bank' });
        data.penalties.push({ id: uid('penalty'), amount: amount, reason: reason, date: date, time: stamp(), account: 'bank', from: 'nathan' });
        if (save()) { modal('entryModal', false); render(); notify('Nathan被罚款', '从Nathan余额扣 ¥' + money(amount) + ' → 银行\n' + reason); }
      } else {
        var entry = { id: uid(type), amount: amount, reason: reason, date: date, time: stamp(), account: account };
        data.penalties.push(entry);
        accountChange(account, amount, 'penalty_deposit', reason, date);
        if (save()) { modal('entryModal', false); render(); notify('罚金已交', '¥' + money(amount) + ' → ' + ACCOUNT_META[account].label + '\n' + reason); }
      }
    } else {
      var entry = { id: uid(type), amount: amount, reason: reason, date: date, time: stamp(), account: account };
      data.income.push(entry);
      accountChange(account, amount, 'account_income', reason, date);
      if (save()) { modal('entryModal', false); render(); notify('收入已入账', '¥' + money(amount) + ' → ' + ACCOUNT_META[account].label + '\n' + reason); }
    }
  }

  function saveSpend() {
    var amount = round(Number($('spendAmount').value));
    var account = $('spendPool').value;
    var reason = $('spendReason').value.trim() || '支出';
    var date = $('spendDate').value || today();
    if (!(amount > 0)) return alert('请输入有效金额');
    if (amount > data.accounts[account].balance) return alert(ACCOUNT_META[account].label + '余额不足');
    accountChange(account, -amount, 'account_expense', reason, date, { category: $('spendCategory').value || 'other' });
    if (save()) { modal('spendModal', false); render(); notify('支出已记录', ACCOUNT_META[account].label + '支出 ¥' + money(amount) + '\n' + reason); }
  }

  function showAccount(key) {
    var account = data.accounts[key];
    var tx = data.allocation.transactions.filter(function (x) { return x.account === key || x.pool === key; }).slice().reverse().slice(0, 50);
    $('accountModalTitle').textContent = account.icon + ' ' + account.label;
    $('accountModalBalance').textContent = '当前余额 ¥' + money(account.balance);
    $('accountTransactions').innerHTML = tx.length ? tx.map(function (x) { var amount = Number(x.amount || 0); return '<div class="pool-transaction"><div><b>' + esc(x.note || '账户变动') + '</b><small>' + esc(x.date) + '</small></div><strong class="' + (amount >= 0 ? 'income' : 'expense') + '">' + (amount >= 0 ? '+' : '-') + '¥' + money(Math.abs(amount)) + '</strong></div>'; }).join('') : '<div class="empty-hint">暂无流水</div>';
    modal('accountModal', true);
  }

  function openFinanceDetail(note) {
    $('detailNoteId').value = note.id;
    $('detailBadge').textContent = note.type === 'weekly' ? '📊 周报' : '📋 理财笔记';
    $('detailDate').textContent = note.date || '';
    $('detailTitle').textContent = note.title || '';
    var html = '<p>' + esc(note.content || '') + '</p>';
    if (note.type === 'weekly') html += (note.week_start ? '<small>' + esc(note.week_start) + ' ~ ' + esc(note.week_end || '') + '</small>' : '') + (note.diet_note ? '<div class="diet-note">🥗 ' + esc(note.diet_note) + '</div>' : '') + (note.score ? '<div class="weekly-score">评分：' + '⭐'.repeat(Number(note.score)) + '</div>' : '');
    else html += (note.expected_return ? '<small>预期收益：' + esc(note.expected_return) + '</small>' : '') + (note.risk ? '<small>风险：' + esc(note.risk) + '</small>' : '');
    $('detailBody').innerHTML = html;
    $('detailNayaComment').style.display = note.naya_comment ? 'block' : 'none';
    $('detailNayaComment').textContent = note.naya_comment ? '💬 Naya：' + note.naya_comment : '';
    $('detailCommentForm').hidden = true;
    $('detailCommentInput').value = note.naya_comment || '';
    $('btnWriteComment').hidden = false;
    $('btnSaveComment').hidden = true;
    modal('financeDetailModal', true);
  }

  function openNewNote() {
    var weekly = financeFilter === 'weekly';
    $('financeNoteId').value = '';
    $('financeType').value = weekly ? 'weekly' : 'note';
    $('financeModalTitle').textContent = weekly ? '新增周报' : '新增理财笔记';
    $('financeDate').value = today();
    $('financeTitle').value = '';
    $('financeContent').value = '';
    $('weekStart').value = '';
    $('weekEnd').value = '';
    $('dietNote').value = '';
    $('weekScore').value = '';
    $('financeReturn').value = '';
    $('financeRisk').value = '';
    $('weeklyFields').style.display = weekly ? 'block' : 'none';
    $('noteOnlyFields').style.display = weekly ? 'none' : 'block';
    document.querySelectorAll('.score-btn').forEach(function (b) { b.classList.remove('active'); });
    modal('financeModal', true);
  }

  function saveNote() {
    var type = $('financeType').value;
    var title = $('financeTitle').value.trim();
    if (!title) return alert('请填写标题');
    var note = { id: uid('fn'), type: type, date: $('financeDate').value || today(), title: title, content: $('financeContent').value.trim(), created_at: stamp(), updated_at: stamp(), naya_comment: '' };
    if (type === 'weekly') Object.assign(note, { week_start: $('weekStart').value, week_end: $('weekEnd').value, diet_note: $('dietNote').value.trim(), score: $('weekScore').value ? Number($('weekScore').value) : null });
    else Object.assign(note, { expected_return: $('financeReturn').value.trim(), risk: $('financeRisk').value.trim(), status: 'pending' });
    data.finance_notes.push(note);
    if (save()) { modal('financeModal', false); renderFinance(); }
  }

  function openNotificationSettings() {
    var n = data.notification;
    $('notificationEnabled').checked = n.enabled !== false;
    $('notificationCharacter').innerHTML = '<option value="' + esc(n.character_name || 'Nathan') + '">' + esc(n.character_name || 'Nathan') + '</option>';
    $('notificationChat').innerHTML = '<option value="' + esc(n.chat_id || '') + '">' + esc(n.chat_title || '未绑定窗口') + '</option>';
    $('notificationTargetHint').textContent = n.chat_id ? '当前绑定：' + (n.chat_title || '未命名窗口') : '尚未绑定 Nathan 对话窗口';
    modal('notificationModal', true);
  }

  function saveNotification() {
    data.notification.enabled = $('notificationEnabled').checked;
    if (save()) modal('notificationModal', false);
  }

  function rebindNotification() {
    try {
      var result = JSON.parse(FundHost.rebindNotification(JSON.stringify({ character_name: $('notificationCharacter').value || 'Nathan' })));
      $('notificationTargetHint').textContent = result.success ? '已请求重新绑定，请稍后重新打开设置确认。' : (result.message || '重新绑定失败');
    } catch (e) { $('notificationTargetHint').textContent = '重新绑定失败'; }
  }

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (target.classList.contains('btn-cancel')) return modal(target.closest('.modal').id, false);
    if (target.classList.contains('modal')) return modal(target.id, false);
    var accountBtn = target.closest('[data-account]');
    if (accountBtn) return showAccount(accountBtn.dataset.account);
    var noteBtn = target.closest('[data-note]');
    if (noteBtn) return openFinanceDetail(data.finance_notes.filter(function (n) { return n.id === noteBtn.dataset.note; })[0]);
    if (target.dataset.tab) {
      tab = target.dataset.tab;
      visibleRecords = 20;
      document.querySelectorAll('[data-tab]').forEach(function (b) { b.classList.toggle('active', b === target); });
      $('recordView').hidden = tab === 'wishes' || tab === 'finance';
      $('wishView').hidden = tab !== 'wishes';
      $('financeView').hidden = tab !== 'finance';
      return render();
    }
    if (target.dataset.filter) {
      wishFilter = target.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(function (b) { b.classList.toggle('active', b === target); });
      return renderWishes();
    }
    if (target.dataset.ftab) {
      financeFilter = target.dataset.ftab;
      document.querySelectorAll('[data-ftab]').forEach(function (b) { b.classList.toggle('active', b === target); });
      return renderFinance();
    }
    if (target.dataset.review) return openWishReview(data.wishes.filter(function (w) { return w.id === target.dataset.review; })[0]);
    if (target.dataset.edit) return openWish(data.wishes.filter(function (w) { return w.id === target.dataset.edit; })[0]);
    if (target.dataset.resolve) return openResolve(data.wishes.filter(function (w) { return w.id === target.dataset.resolve; })[0]);
    if (target.dataset.rejectedAction) return openRejectedAction(data.wishes.filter(function (w) { return w.id === target.dataset.rejectedAction; })[0]);
    if (target.dataset.deleteCategory) { data.wish_categories = data.wish_categories.filter(function (c) { return c.id !== target.dataset.deleteCategory; }); save(); renderCategories(); fillCategories(); }
    if (target.dataset.deleteSpendCategory) { data.spend_categories = data.spend_categories.filter(function (c) { return c.id !== target.dataset.deleteSpendCategory; }); save(); renderSpendCategories(); renderHistory(); }
    if (target.dataset.scat != null) {
      spendCategoryFilter = target.dataset.scat;
      visibleRecords = 20;
      renderHistory();
      return;
    }
    if (target.dataset.scatManage != null) {
      renderSpendCategories(); modal('spendCategoryModal', true);
      return;
    }
    if (target.dataset.wishMove) {
      var parts = target.dataset.wishMove.split(':'); var wid = parts[0]; var dir = parts[1];
      var pending = data.wishes.filter(function(w){return w.status==='pending';}).sort(function(a,b){return (a.sort_order||0)-(b.sort_order||0);});
      var idx = pending.findIndex(function(w){return w.id===wid;});
      if (idx>=0) {
        var swapIdx = dir==='up' ? idx-1 : idx+1;
        if (swapIdx>=0 && swapIdx<pending.length) {
          var tmp = pending[idx].sort_order; pending[idx].sort_order = pending[swapIdx].sort_order; pending[swapIdx].sort_order = tmp;
          save(); renderWishes();
        }
      }
    }
  });

  $('btnPenalty').onclick = function () { $('entryType').value = 'penalty'; $('entryTitle').textContent = '添加罚金'; $('penaltyTarget').value = 'naya'; $('entryPool').value = 'bank'; $('entryAmount').value = ''; $('entryReason').value = ''; $('entryDate').value = today(); $('penaltyTargetRow').hidden = false; $('entryPoolRow').hidden = false; modal('entryModal', true); };
  $('penaltyTarget').onchange = function () { $('entryPoolRow').hidden = $('penaltyTarget').value === 'nathan'; };
  $('btnIncome').onclick = function () { $('entryType').value = 'income'; $('entryTitle').textContent = '添加收入'; $('entryPool').value = 'naya'; $('entryAmount').value = ''; $('entryReason').value = ''; $('entryDate').value = today(); $('penaltyTargetRow').hidden = true; $('entryPoolRow').hidden = false; modal('entryModal', true); };
  $('entryConfirm').onclick = saveEntry;
  $('btnSpend').onclick = function () { $('spendAmount').value = ''; $('spendPool').value = 'naya'; $('spendReason').value = ''; fillSpendCategories(''); $('spendDate').value = today(); modal('spendModal', true); };
  $('spendConfirm').onclick = saveSpend;
  $('btnWish').onclick = function () { openWish(); };
  $('wishReviewConfirm').onclick = function() {
    var w = data.wishes.filter(function(x){return x.id===$('reviewWishId').value;})[0];
    if (!w) return;
    var content = $('reviewContent').value.trim();
    if (!content) return alert('请写点内容');
    if (!w.reviews) w.reviews = [];
    w.reviews.push({ id: 'rv_'+Date.now().toString(36), date: today(), time: stamp(), content: content });
    if (save()) { modal('wishReviewModal', false); renderWishes(); }
  };
  $('wishConfirm').onclick = saveWish;
  $('resolveStatus').onchange = updateResolveFields;
  $('resolveConfirm').onclick = resolveWish;
  $('btnCategoryManage').onclick = function () { renderCategories(); modal('categoryModal', true); };
  $('categoryAdd').onclick = function () { var name = $('categoryName').value.trim(); if (!name) return; if (data.wish_categories.some(function (c) { return c.name === name; })) return alert('这个合集已经存在'); data.wish_categories.push({ id: uid('cat'), name: name, created_at: stamp() }); $('categoryName').value = ''; save(); renderCategories(); fillCategories(name); };
  $('btnRewish').onclick = function () { var w = data.wishes.filter(function (x) { return x.id === $('rejectedWishId').value; })[0]; if (!w) return; w.status = 'pending'; w.resolved_at = null; w.resolution_note = ''; save(); modal('rejectedActionModal', false); openWish(w); };
  $('btnSelfBuy').onclick = function () { var w = data.wishes.filter(function (x) { return x.id === $('rejectedWishId').value; })[0]; if (!w) return; modal('rejectedActionModal', false); openResolve(w, 'self_acquired'); };
  $('btnGiveUp').onclick = function () { var w = data.wishes.filter(function (x) { return x.id === $('rejectedWishId').value; })[0]; if (!w) return; w.status = 'dismissed'; w.resolved_at = stamp(); w.resolution_note = '驳回后决定放弃'; save(); modal('rejectedActionModal', false); render(); };
  $('balanceCheck').onclick = function () { $('checkNaya').value = money(data.accounts.naya.balance); $('checkNathan').value = money(data.accounts.nathan.balance); $('checkBank').value = money(data.accounts.bank.balance); modal('checkModal', true); };
  $('checkConfirm').onclick = function () { var naya = Number($('checkNaya').value), nathan = Number($('checkNathan').value), bank = Number($('checkBank').value); if ([naya, nathan, bank].some(function (v) { return !isFinite(v) || v < 0; })) return alert('请填写有效余额'); [['naya', naya], ['nathan', nathan], ['bank', bank]].forEach(function (pair) { var diff = round(pair[1] - data.accounts[pair[0]].balance); data.accounts[pair[0]].balance = round(pair[1]); data.accounts[pair[0]].last_changed_at = stamp(); if (diff) data.allocation.transactions.push({ id: uid('tx'), date: today(), time: stamp(), type: 'manual_check', account: pair[0], pool: pair[0], amount: diff, note: '手动对账校准' }); }); syncLegacy(); save(); modal('checkModal', false); render(); };
  $('recordSort').onclick = function () { recordDesc = !recordDesc; visibleRecords = 20; renderHistory(); };
  $('btnLoadMore').onclick = function () { visibleRecords += 20; renderHistory(); };
  $('btnFinanceNote').onclick = openNewNote;
  $('financeConfirm').onclick = saveNote;
  $('scoreRow').onclick = function (event) { var button = event.target.closest('.score-btn'); if (!button) return; document.querySelectorAll('.score-btn').forEach(function (b) { b.classList.remove('active'); }); button.classList.add('active'); $('weekScore').value = button.dataset.score; };
  $('btnWriteComment').onclick = function () { $('detailCommentForm').hidden = false; $('btnWriteComment').hidden = true; $('btnSaveComment').hidden = false; };
  $('btnSaveComment').onclick = function () { var note = data.finance_notes.filter(function (n) { return n.id === $('detailNoteId').value; })[0]; if (!note) return; note.naya_comment = $('detailCommentInput').value.trim(); note.updated_at = stamp(); if (save()) { modal('financeDetailModal', false); renderFinance(); notify('Naya写了评语', '笔记「' + (note.title||'') + '」\n' + note.naya_comment); } };
  $('btnSettings').onclick = function () { modal('settingsModal', true); };
  $('settingsGuideBtn').onclick = function () { modal('settingsModal', false); modal('guideModal', true); };
  $('settingsNotifBtn').onclick = function () { modal('settingsModal', false); openNotificationSettings(); };
  $('settingsSalaryBtn').onclick = function () { modal('settingsModal', false); openSalarySettings(); };
  $('notificationSave').onclick = saveNotification;
  $('notificationBind').onclick = rebindNotification;
  $('spendCategoryAdd').onclick = function () { var name = $('spendCategoryName').value.trim(); if (!name) return; if (data.spend_categories.some(function (c) { return c.name === name; })) return alert('这个分类已经存在'); data.spend_categories.push({ id: uid('scat'), name: name, created_at: stamp() }); $('spendCategoryName').value = ''; save(); renderSpendCategories(); renderHistory(); };

  // 日薪设置
  function openSalarySettings() {
    var s = data.salary_settings || { enabled: true, amount: 5 };
    $('salaryEnabled').checked = s.enabled !== false;
    $('salaryAmount').value = s.amount || 5;
    modal('salaryModal', true);
  }
  $('salarySave').onclick = function () {
    var enabled = $('salaryEnabled').checked;
    var amount = round(Number($('salaryAmount').value));
    if (amount <= 0) return alert('日薪金额必须大于0');
    data.salary_settings = { enabled: enabled, amount: amount };
    if (save()) { modal('salaryModal', false); render(); }
  };

  // 罚Nathan
  $('btnPenaltyNathan').onclick = function () {
    $('penaltyNathanAmount').value = '';
    $('penaltyNathanReason').value = '';
    $('penaltyNathanDate').value = today();
    modal('penaltyNathanModal', true);
  };
  $('penaltyNathanConfirm').onclick = function () {
    var amount = round(Number($('penaltyNathanAmount').value));
    var reason = $('penaltyNathanReason').value.trim() || 'Nathan犯错罚金';
    var date = $('penaltyNathanDate').value || today();
    if (!(amount > 0)) return alert('请输入有效金额');
    if (amount > data.accounts.nathan.balance) return alert('Nathan余额不足（当前¥' + money(data.accounts.nathan.balance) + '）');
    accountChange('nathan', -amount, 'nathan_penalty', reason, date, { penalty_direction: 'nathan_to_bank' });
    accountChange('bank', amount, 'nathan_penalty', reason, date, { penalty_direction: 'nathan_to_bank' });
    data.penalties.push({ id: uid('penalty'), amount: amount, reason: reason, date: date, time: stamp(), account: 'bank', from: 'nathan' });
    if (save()) { modal('penaltyNathanModal', false); render(); notify('Nathan被罚款', '从Nathan余额扣 ¥' + money(amount) + ' → 银行\n' + reason); }
  };
}());
