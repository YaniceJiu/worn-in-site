'use strict';

(() => {
  const CARD_TOTAL = 35;
  const CARD_ORDER_VERSION = 2;
  const CABINET_GROUP_VERSION = 1;
  const SCENE_LAYOUT_VERSION = 3;
  const ART_ASPECT_RATIOS = {
    window: 893 / 1077,
    cabinet: 1258 / 1304,
    lamp: 1330 / 1084
  };
  const CARD_ORDER = [
    30, 25, 28, 2, 23, 8, 24, 6, 13, 21, 31, 4, 34, 15, 29, 1, 14, 7,
    16, 3, 5, 9, 35, 33, 10, 20, 17, 11, 18, 12, 22, 27, 26, 19, 32
  ];
  const CABINET_GROUPS = [
    Array.from({ length: 9 }, (_, i) => i + 1),
    Array.from({ length: 9 }, (_, i) => i + 10),
    Array.from({ length: 9 }, (_, i) => i + 19),
    [...Array.from({ length: 8 }, (_, i) => i + 28), 36]
  ];
  const CABINET_SLOTS = [
    { x: 34.0, y: 27.5, w: 14.0, h: 11.6 },
    { x: 54.5, y: 27.0, w: 13.2, h: 11.2 },
    { x: 74.8, y: 26.0, w: 12.3, h: 11.0 },
    { x: 36.3, y: 45.9, w: 12.2, h: 12.1 },
    { x: 55.0, y: 44.6, w: 13.2, h: 11.6 },
    { x: 75.3, y: 43.6, w: 12.2, h: 11.4 },
    { x: 43.8, y: 62.0, w: 5.2, h: 9.5 },
    { x: 55.1, y: 61.6, w: 13.2, h: 9.1 },
    { x: 75.2, y: 60.5, w: 4.5, h: 8.2 }
  ];
  const STORAGE_KEY = 'wornin_torn_paper_v1';
  const DEFAULT_POSITIONS = {
    window: { x: 0.07, y: 0.08 },
    cabinet: { x: 0.31, y: 0.35 },
    lamp: { x: 0.70, y: 0.37 }
  };
  const DEFAULT_LAYOUT = {
    background: { x: 0, y: 0, w: 100, h: 100 },
    window: { x: 5, y: 10, w: 22, h: 35 },
    cabinet: { x: 29, y: 25, w: 43, h: 57 },
    cards: { x: 0, y: 0, w: 100, h: 100 },
    lamp: { x: 72, y: 21, w: 25, h: 37 }
  };
  const LAYOUT_LABELS = {
    background: '背景',
    window: '窗框',
    cabinet: '桌面柜',
    cards: '柜中颜料卡',
    lamp: '台灯'
  };
  const $ = id => document.getElementById(id);
  const stage = $('stage');
  const paperWindow = $('paperWindow');
  const collection = $('collection');
  const cabinetGrid = $('cabinetGrid');
  const cabinetCardLayer = $('cabinetCards');
  const selectionOutline = $('selectionOutline');
  const layerSelect = $('editLayer');
  const editorPanel = $('layoutEditor');
  const editorToggle = $('editorToggle');
  const saveStatus = $('saveStatus');
  const modal = $('cardModal');
  const confirmButton = $('confirmCard');
  const replaceToggle = $('replaceToggle');
  const cabinetTabs = $('cabinetTabs');
  const toastNode = $('toast');
  let toastTimer;
  let pendingCard = null;
  let assigningSlot = null;
  let layoutMode = true;
  let activeEditorLayer = 'background';
  let saveStatusTimer;
  let cardsInWindow = [];

  function readSavedState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const cardId = id => {
        if (!Number.isInteger(id) || id < 1 || id > CARD_TOTAL) return id;
        if (saved.cardOrderVersion === CARD_ORDER_VERSION) return id;
        return CARD_ORDER.indexOf(id) + 1;
      };
      const hasSavedGroups = saved.cabinetGroupVersion === CABINET_GROUP_VERSION
        && Array.isArray(saved.cabinetGroups)
        && saved.cabinetGroups.length === CABINET_GROUPS.length;
      const groups = hasSavedGroups
        ? saved.cabinetGroups.map(group => Array.isArray(group) && group.length === 9
          ? group.map(cardId)
          : null)
        : CABINET_GROUPS.map(group => [...group]);
      if (!hasSavedGroups && Array.isArray(saved.cabinetCards) && saved.cabinetCards.length === 9) {
        groups[0] = saved.cabinetCards.map(cardId);
      }
      const sceneLayout = Object.fromEntries(Object.entries(DEFAULT_LAYOUT).map(([key, defaults]) => {
        const savedLayer = saved.sceneLayout && saved.sceneLayout[key];
        const legacyPosition = saved.positions && saved.positions[key];
        return [key, {
          x: savedLayer && Number.isFinite(savedLayer.x)
            ? savedLayer.x
            : legacyPosition && Number.isFinite(legacyPosition.x) ? legacyPosition.x * 100 : defaults.x,
          y: savedLayer && Number.isFinite(savedLayer.y)
            ? savedLayer.y
            : legacyPosition && Number.isFinite(legacyPosition.y) ? legacyPosition.y * 100 : defaults.y,
          w: key === 'background' && savedLayer && Number.isFinite(savedLayer.w)
            ? savedLayer.w
            : defaults.w,
          h: defaults.h
        }];
      }));
      return {
        positions: { ...DEFAULT_POSITIONS, ...(saved.positions || {}) },
        sceneLayout,
        cabinetGroups: groups.map((group, groupIndex) => (group || CABINET_GROUPS[groupIndex]).map((id, slotIndex) => (
          Number.isInteger(id) && id >= 1 && (id <= CARD_TOTAL || (groupIndex === 3 && slotIndex === 8 && id === 36))
            ? id
            : CABINET_GROUPS[groupIndex][slotIndex]
        ))),
        activeCabinetGroup: Number.isInteger(saved.activeCabinetGroup)
          && saved.activeCabinetGroup >= 0
          && saved.activeCabinetGroup < CABINET_GROUPS.length
          ? saved.activeCabinetGroup
          : 0,
        cardsInWindow: Array.isArray(saved.cardsInWindow)
          ? saved.cardsInWindow
            .filter(card => card && Number.isInteger(card.id) && card.id > 0 && card.id <= CARD_TOTAL)
            .map(card => ({ ...card, id: cardId(card.id) }))
          : [],
        needsMigration: saved.cardOrderVersion !== CARD_ORDER_VERSION
          || saved.cabinetGroupVersion !== CABINET_GROUP_VERSION
          || saved.sceneLayoutVersion !== SCENE_LAYOUT_VERSION
      };
    } catch (error) {
      console.warn('无法读取撕纸工作台的本地进度，将使用初始摆放。', error);
      return {
        positions: { ...DEFAULT_POSITIONS },
        sceneLayout: Object.fromEntries(Object.entries(DEFAULT_LAYOUT).map(([key, value]) => [key, { ...value }])),
        cabinetGroups: CABINET_GROUPS.map(group => [...group]),
        activeCabinetGroup: 0,
        cardsInWindow: [],
        needsMigration: false
      };
    }
  }

  const savedState = readSavedState();
  const sceneLayout = savedState.sceneLayout;
  const cabinetGroups = savedState.cabinetGroups;
  let activeCabinetGroup = savedState.activeCabinetGroup;
  cardsInWindow = savedState.cardsInWindow
    .filter(card => Number.isInteger(card.id) && card.id > 0 && card.id <= CARD_TOTAL)
    .map(card => ({ id: card.id, x: clamp(card.x, 0, 1), y: clamp(card.y, 0, 1) }));

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        cardOrderVersion: CARD_ORDER_VERSION,
        cabinetGroupVersion: CABINET_GROUP_VERSION,
        sceneLayoutVersion: SCENE_LAYOUT_VERSION,
        sceneLayout,
        cabinetGroups,
        activeCabinetGroup,
        cardsInWindow: cardsInWindow.map(({ id, x, y }) => ({ id, x, y }))
      }));
      saveStatus.textContent = '正在保存…';
      clearTimeout(saveStatusTimer);
      saveStatusTimer = setTimeout(() => {
        saveStatus.textContent = '已自动保存';
      }, 250);
    } catch (error) {
      console.warn('无法保存撕纸工作台进度。', error);
      saveStatus.textContent = '保存失败';
      showToast('进度暂时无法保存，请检查浏览器存储设置');
    }
  }

  function showToast(message) {
    toastNode.textContent = message;
    toastNode.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastNode.classList.remove('show'), 2200);
  }

  function cardURL(id) {
    const sourceId = CARD_ORDER[id - 1];
    return `../assets/torn-paper/cards/card-${String(sourceId).padStart(2, '0')}.png`;
  }

  function buildCollection() {
    for (let id = 1; id <= CARD_TOTAL; id += 1) {
      const button = document.createElement('button');
      button.className = 'swatch';
      button.type = 'button';
      button.setAttribute('aria-label', `查看第 ${id} 张色卡`);
      const image = document.createElement('img');
      image.src = cardURL(id);
      image.alt = '';
      image.draggable = false;
      image.onerror = () => {
        button.disabled = true;
        button.classList.add('unavailable');
        button.textContent = '图片加载失败';
        console.error(`色卡图片未能加载：${image.src}`);
      };
      const index = document.createElement('span');
      index.className = 'swatch-index';
      index.textContent = String(id).padStart(2, '0');
      button.append(image, index);
      button.addEventListener('click', () => selectFromCollection(id));
      collection.append(button);
    }

    const missing = document.createElement('button');
    missing.className = 'swatch unavailable';
    missing.type = 'button';
    missing.disabled = true;
    missing.setAttribute('aria-label', '第 36 张色卡素材待补');
    missing.innerHTML = '36<br>待补图';
    collection.append(missing);
    $('collectionCount').textContent = '01 → 35';
    $('assetNotice').textContent = '素材文件夹目前有 35 张色卡；第 36 张待补充后即可加入。';
  }

  function buildCabinet() {
    cabinetCardLayer.replaceChildren();
    cabinetGrid.replaceChildren();
    cabinetGrid.setAttribute('aria-label', `第 ${activeCabinetGroup + 1} 组，桌面柜里的九张色卡`);
    cabinetGroups[activeCabinetGroup].forEach((cardId, index) => {
      const slot = CABINET_SLOTS[index];
      const button = document.createElement('button');
      const isMissing = cardId === 36;
      button.className = `cabinet-slot${isMissing ? ' missing-slot' : ''}`;
      button.type = 'button';
      button.style.left = `${slot.x}%`;
      button.style.top = `${slot.y}%`;
      button.style.width = `${slot.w}%`;
      button.style.height = `${slot.h}%`;
      button.setAttribute('aria-label', isMissing
        ? `第 ${activeCabinetGroup + 1} 组第 ${index + 1} 格，等待第 36 张色卡素材`
        : `第 ${activeCabinetGroup + 1} 组第 ${index + 1} 格，色卡 ${String(cardId).padStart(2, '0')}`);
      if (isMissing) {
        button.disabled = true;
        const missing = document.createElement('span');
        missing.textContent = '待补';
        button.append(missing);
      } else {
        const image = document.createElement('img');
        image.src = cardURL(cardId);
        image.alt = '';
        image.draggable = false;
        image.className = 'cabinet-underlay-card';
        image.style.left = `${slot.x}%`;
        image.style.top = `${slot.y}%`;
        image.style.width = `${slot.w}%`;
        image.style.height = `${slot.h}%`;
        image.onerror = () => {
          console.error(`柜中色卡图片未能加载：${image.src}`);
        };
        cabinetCardLayer.append(image);
      }
      const number = document.createElement('span');
      number.className = 'slot-number';
      number.textContent = String(index + 1);
      if (!isMissing) button.append(number);
      button.addEventListener('click', () => {
        if (assigningSlot !== null) {
          assigningSlot = index;
          cabinetGrid.querySelectorAll('.cabinet-slot').forEach((slot, slotIndex) => {
            slot.classList.toggle('selected', slotIndex === index);
          });
          $('replaceHint').textContent = `已选第 ${index + 1} 格，再点下面的色卡替换`;
          return;
        }
        openPreview(cardId);
      });
      cabinetGrid.append(button);
    });
  }

  function setActiveCabinetGroup(groupIndex) {
    if (!Number.isInteger(groupIndex) || groupIndex < 0 || groupIndex >= CABINET_GROUPS.length) return;
    activeCabinetGroup = groupIndex;
    assigningSlot = null;
    replaceToggle.setAttribute('aria-pressed', 'false');
    $('replaceHint').textContent = '';
    cabinetTabs.querySelectorAll('.cabinet-tab').forEach(tab => {
      const isActive = Number(tab.dataset.group) === activeCabinetGroup;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-pressed', String(isActive));
    });
    buildCabinet();
    saveState();
  }

  function selectFromCollection(id) {
    if (assigningSlot !== null) {
      if (assigningSlot < 0) {
        showToast('先点选柜子里的格子');
        return;
      }
      cabinetGroups[activeCabinetGroup][assigningSlot] = id;
      assigningSlot = null;
      replaceToggle.setAttribute('aria-pressed', 'false');
      $('replaceHint').textContent = '';
      buildCabinet();
      saveState();
      showToast('已放进桌面柜');
      return;
    }
    openPreview(id);
  }

  function openPreview(id) {
    pendingCard = id;
    $('previewImage').src = cardURL(id);
    $('previewImage').alt = `第 ${String(id).padStart(2, '0')} 张撕纸色卡`;
    $('previewCaption').textContent = `COLOR PAPER  ·  ${String(id).padStart(2, '0')}`;
    $('modalTitle').textContent = '这张颜色，留在画里吗？';
    confirmButton.innerHTML = '<span>👉</span> 确认放进窗框';
    modal.classList.remove('hidden');
    $('cancelPreview').focus();
  }

  function closePreview() {
    modal.classList.add('hidden');
    pendingCard = null;
  }

  function renderWindow() {
    paperWindow.querySelectorAll('.paper-card').forEach(card => card.remove());
    const rows = Math.max(1, Math.ceil(cardsInWindow.length / 3));
    cardsInWindow.forEach((card, index) => {
      const paper = document.createElement('img');
      paper.className = 'paper-card';
      paper.src = cardURL(card.id);
      paper.alt = `窗框内第 ${index + 1} 张色卡，双击可移除`;
      paper.title = '拖动可在窗框内调整；双击移除';
      paper.draggable = false;
      paper.style.left = `${card.x * 100}%`;
      paper.style.top = `${card.y * 100}%`;
      paper.style.width = '29%';
      paper.style.height = 'auto';
      paper.style.maxHeight = `calc(94% / ${rows})`;
      paper.style.maxWidth = '31%';
      paper.style.objectFit = 'contain';
      paper.addEventListener('pointerdown', startPaperDrag);
      paper.addEventListener('dblclick', () => {
        cardsInWindow.splice(index, 1);
        renderWindow();
        saveState();
        showToast('色卡已从窗框取下');
      });
      paper.onerror = () => {
        console.error(`窗框内的色卡图片未能加载：${paper.src}`);
        showToast('色卡图片加载失败，请刷新页面后重试');
      };
      paperWindow.append(paper);
      if (index === cardsInWindow.length - 1 && card.entering) {
        paper.classList.add('entering');
        delete card.entering;
      }
    });
  }

  function addToWindow(id) {
    const index = cardsInWindow.length;
    const column = index === 0 ? 1 : index % 3 === 0 ? 0 : index % 3 === 1 ? 0 : 2;
    const rows = Math.ceil((index + 1) / 3);
    cardsInWindow.push({
      id,
      x: column / 3 + 0.02,
      y: (Math.floor(index / 3) + 0.04) / rows,
      entering: true
    });
    renderWindow();
    saveState();
    showToast(`色卡 ${String(id).padStart(2, '0')} 已贴进窗框`);
  }

  function startPaperDrag(event) {
    if (event.button !== 0 && event.pointerType !== 'touch') return;
    event.preventDefault();
    event.stopPropagation();
    const paper = event.currentTarget;
    const index = [...paperWindow.querySelectorAll('.paper-card')].indexOf(paper);
    const windowRect = paperWindow.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = paper.offsetLeft;
    const startTop = paper.offsetTop;
    paper.setPointerCapture(event.pointerId);
    const move = moveEvent => {
      const maxLeft = Math.max(0, windowRect.width - paper.offsetWidth);
      const maxTop = Math.max(0, windowRect.height - paper.offsetHeight);
      const left = clamp(startLeft + moveEvent.clientX - startX, 0, maxLeft);
      const top = clamp(startTop + moveEvent.clientY - startY, 0, maxTop);
      paper.style.left = `${left / windowRect.width * 100}%`;
      paper.style.top = `${top / windowRect.height * 100}%`;
      if (cardsInWindow[index]) {
        cardsInWindow[index].x = left / windowRect.width;
        cardsInWindow[index].y = top / windowRect.height;
      }
    };
    const stop = () => {
      paper.removeEventListener('pointermove', move);
      paper.removeEventListener('pointerup', stop);
      paper.removeEventListener('pointercancel', stop);
      saveState();
    };
    paper.addEventListener('pointermove', move);
    paper.addEventListener('pointerup', stop);
    paper.addEventListener('pointercancel', stop);
  }

  function applySceneLayer(layerName) {
    const item = sceneLayout[layerName];
    if (layerName === 'cards') {
      item.h = item.w;
      [cabinetCardLayer, cabinetGrid].forEach(layer => {
        layer.style.left = `${item.x}%`;
        layer.style.top = `${item.y}%`;
        layer.style.width = `${item.w}%`;
        layer.style.height = `${item.h}%`;
      });
      return;
    }

    const element = $(`${layerName}Piece`);
    element.style.left = `${item.x}%`;
    element.style.top = `${item.y}%`;
    element.style.width = `${item.w}%`;
    if (ART_ASPECT_RATIOS[layerName]) {
      item.h = item.w * stage.clientWidth / stage.clientHeight / ART_ASPECT_RATIOS[layerName];
    }
    element.style.height = `${item.h}%`;
  }

  function applySceneLayout() {
    Object.keys(DEFAULT_LAYOUT).forEach(applySceneLayer);
  }

  function updateSelectionOutline() {
    const selected = activeEditorLayer === 'cards' ? cabinetCardLayer : $(`${activeEditorLayer}Piece`);
    const stageRect = stage.getBoundingClientRect();
    const layerRect = selected.getBoundingClientRect();
    selectionOutline.style.left = `${layerRect.left - stageRect.left}px`;
    selectionOutline.style.top = `${layerRect.top - stageRect.top}px`;
    selectionOutline.style.width = `${layerRect.width}px`;
    selectionOutline.style.height = `${layerRect.height}px`;
    selectionOutline.dataset.layer = activeEditorLayer;
    selectionOutline.dataset.label = LAYOUT_LABELS[activeEditorLayer];
  }

  function updateEditorControls() {
    const item = sceneLayout[activeEditorLayer];
    $('layerWLabel').textContent = activeEditorLayer === 'background'
      ? '宽度 / 横向拉伸'
      : '宽度 / 等比缩放';
    document.querySelectorAll('.editor-control input').forEach(input => {
      const property = input.dataset.property;
      input.value = String(item[property]);
      input.disabled = property === 'h';
      $(`${input.id}Value`).textContent = `${Math.round(item[property] * 10) / 10}%`;
    });
    updateSelectionOutline();
  }

  function setSelectedEditorLayer(layerName) {
    if (!sceneLayout[layerName]) return;
    activeEditorLayer = layerName;
    layerSelect.value = layerName;
    updateEditorControls();
  }

  function bindLayerDragging() {
    document.querySelectorAll('[data-draggable-layer] .piece-art').forEach(image => {
      image.addEventListener('pointerdown', event => {
        if (!layoutMode || (event.button !== 0 && event.pointerType !== 'touch')) return;
        const layerName = image.closest('[data-draggable-layer]').dataset.draggableLayer;
        event.preventDefault();
        event.stopPropagation();
        setSelectedEditorLayer(layerName);
        const bounds = stage.getBoundingClientRect();
        const layer = image.closest('.scene-layer, .piece');
        const item = sceneLayout[layerName];
        const startX = event.clientX;
        const startY = event.clientY;
        const startLeft = item.x / 100 * bounds.width;
        const startTop = item.y / 100 * bounds.height;
        layer.style.zIndex = '20';
        image.setPointerCapture(event.pointerId);
        const move = moveEvent => {
          item.x = clamp((startLeft + moveEvent.clientX - startX) / bounds.width * 100, -100, 100);
          item.y = clamp((startTop + moveEvent.clientY - startY) / bounds.height * 100, -100, 100);
          applySceneLayer(layerName);
          updateEditorControls();
        };
        const stop = () => {
          image.removeEventListener('pointermove', move);
          image.removeEventListener('pointerup', stop);
          image.removeEventListener('pointercancel', stop);
          layer.style.zIndex = '';
          saveState();
        };
        image.addEventListener('pointermove', move);
        image.addEventListener('pointerup', stop);
        image.addEventListener('pointercancel', stop);
      });
    });
  }

  document.querySelectorAll('.editor-control input').forEach(input => {
    input.addEventListener('input', () => {
      const property = input.dataset.property;
      if (property === 'h') return;
      sceneLayout[activeEditorLayer][property] = Number(input.value);
      applySceneLayer(activeEditorLayer);
      updateEditorControls();
      saveState();
    });
  });
  layerSelect.addEventListener('change', () => setSelectedEditorLayer(layerSelect.value));
  editorToggle.addEventListener('click', () => {
    const isOpen = editorPanel.classList.toggle('hidden') === false;
    editorToggle.setAttribute('aria-expanded', String(isOpen));
    editorToggle.textContent = isOpen ? '布局编辑器 · 已打开' : '打开布局编辑器';
  });
  $('resetLayout').addEventListener('click', () => {
    Object.keys(DEFAULT_LAYOUT).forEach(key => {
      Object.assign(sceneLayout[key], DEFAULT_LAYOUT[key]);
      applySceneLayer(key);
    });
    updateEditorControls();
    saveState();
    showToast('所有素材已恢复默认布局');
  });

  $('arrangeToggle').addEventListener('click', event => {
    layoutMode = !layoutMode;
    stage.classList.toggle('layout-mode', layoutMode);
    event.currentTarget.textContent = layoutMode ? '完成摆放 →' : '继续编辑素材';
    $('placementStatus').textContent = layoutMode
      ? '拖动素材，或用编辑器精准调整位置和大小'
      : '摆放已保存；选择色卡贴进窗框';
  });

  replaceToggle.addEventListener('click', () => {
    assigningSlot = assigningSlot === null ? -1 : null;
    const isReplacing = assigningSlot !== null;
    replaceToggle.setAttribute('aria-pressed', String(isReplacing));
    $('replaceHint').textContent = isReplacing ? '先点柜子里的格子，再点下方色卡替换' : '';
    cabinetGrid.querySelectorAll('.cabinet-slot').forEach(slot => slot.classList.remove('selected'));
  });
  cabinetTabs.querySelectorAll('.cabinet-tab').forEach(tab => {
    tab.addEventListener('click', () => setActiveCabinetGroup(Number(tab.dataset.group)));
  });

  $('confirmCard').addEventListener('click', () => {
    if (pendingCard === null) return;
    addToWindow(pendingCard);
    closePreview();
  });
  $('cancelPreview').addEventListener('click', closePreview);
  $('modalBackdrop').addEventListener('click', closePreview);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.classList.contains('hidden')) closePreview();
  });

  applySceneLayout();
  setSelectedEditorLayer(activeEditorLayer);
  buildCollection();
  cabinetTabs.querySelectorAll('.cabinet-tab').forEach(tab => {
    const isActive = Number(tab.dataset.group) === activeCabinetGroup;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-pressed', String(isActive));
  });
  buildCabinet();
  renderWindow();
  bindLayerDragging();
  if (savedState.needsMigration) saveState();
})();
