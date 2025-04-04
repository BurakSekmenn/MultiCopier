// Uygulama adını ayarla
app.setName('MultiCopier');
// Windows 10 bildirimlerinde uygulama kimliğini ayarla
if (process.platform === 'win32') {
  app.setAppUserModelId('com.multicopier.app');
}

// Dil sistemini başlat

// Keep a global reference of objects
let mainWindow;
let tray;
let isQuitting = false;
let isReloadingForLanguageChange = false;

// Dosya yolları

// Clipboard items storage - dosyadan okuma
let clipboardItems = [];

// Pinned items storage
let pinnedPositions = {};

// Varsayılan kısayol tuşları ayarları
let shortcutsConfig = {
  toggleAppVisibility: 'CommandOrControl+Q',
  pastePrefix: 'CommandOrControl+',
  pinPrefix: 'CommandOrControl+Shift+'
};

// Clipboard monitoring
let lastClipboardText = '';
let clipboardWatcher = null;

// Bildirim oluşturma yardımcı fonksiyonu
function createNotification(titleKey, bodyKey, isSilent = false, variables = {}) {
  return new Notification({
    title: t(titleKey),
    body: t(bodyKey, variables),
    silent: isSilent,
    icon: path.join(__dirname, 'assets/icon.png'),
    // Windows için ek ayarlar
    appID: 'com.multicopier.app'
  });
}

// Dosyaları oluştur ve verileri yükle
function initializeStorage() {
  try {
    // Klasörün var olduğundan emin ol
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    
    // Clipboard verilerini yükle
    if (fs.existsSync(clipboardDataPath)) {
      clipboardItems = JSON.parse(data);
      console.log(`${clipboardItems.length} öşe dosyadan yüklendi`);
      
      // Klavye kısayollarını temizle
      clipboardItems = clipboardItems.filter(item => {
        // "Ctrl+Shift+1", "Ctrl+Shift+2" vb. metinleri temizle
        return !item.text.match(/ctrl\+shift\+\d/i);
      });
      
      if (removedCount > 0) {
        console.log(`${removedCount} adet klavye kısayolu metni temizlendi`);
        // Değişiklikleri kaydet
        saveToFile();
      }
    }
    
    // Pinned veri dosyası varsa yükle
    if (fs.existsSync(pinnedDataPath)) {
      pinnedPositions = JSON.parse(data);
      console.log(`Sabitlenmiş pozisyon verileri yüklendi:`, pinnedPositions);
      
      // Sabitlenmiş şeleri işaretle
        
        if (index !== -1) {
          clipboardItems[index].pinned = true;
          console.log(`ID ${numId} olan şe pinned=true olarak işaretlendi, pozisyon: ${position}`);
        }
      }
      
      // Dosyadan yükleme sonrası şeleri doğru sıraya getir
      reorderPinnedItems();
    }
    
    // Kısayol tuşları ayarlarını yükle
    if (fs.existsSync(shortcutsConfigPath)) {
      
      // Eksik ayarları varsayılanlarla tamamla
      shortcutsConfig = {
        ...shortcutsConfig,
        ...loadedConfig
      };
      
      console.log('Kısayol tuşları ayarları yüklendi:', shortcutsConfig);
    } else {
      // Varsayılan yapılandırmayı kaydet
      fs.writeFileSync(shortcutsConfigPath, JSON.stringify(shortcutsConfig, null, 2), 'utf8');
      console.log('Varsayılan kısayol tuşları ayarları oluşturuldu');
    }
  } catch (error) {
    console.error('Dosya yükleme hatası:', error);
    // Hata durumunda boş dizilerle devam et
    clipboardItems = [];
    pinnedPositions = {};
    // Kısayol tuşları için varsayılanları kullan
  }
}

// Verileri dosyaya kaydet
function saveToFile() {
  try {
    fs.writeFileSync(clipboardDataPath, JSON.stringify(clipboardItems, null, 2), 'utf8');
    fs.writeFileSync(pinnedDataPath, JSON.stringify(pinnedPositions, null, 2), 'utf8');
    fs.writeFileSync(shortcutsConfigPath, JSON.stringify(shortcutsConfig, null, 2), 'utf8');
    console.log('Veriler dosyaya kaydedildi');
  } catch (error) {
    console.error('Dosya kaydetme hatası:', error);
  }
}

// Function to send Ctrl+V to paste
function simulatePaste() {
  // PowerShell komutunu doğrudan ışıltırma, geçici dosya yerine
  
  // Komutu ışıltır
  exec(psCommand, (error) => {
    if (error) {
      console.error('Paste simulation error:', error);
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    },
    show: false,
    icon: path.join(__dirname, 'assets/icon.png')
  });

  // Choose the correct HTML file based on the current language
  console.log(`Creating window with language: ${currentLanguage}`);
  
  if (currentLanguage === 'en') {
    mainWindow.loadFile('index-en.html');
  } else {
    mainWindow.loadFile('index.html');
  }
  
  // Ana pencereye menü ekle (artık updateAppMenu fonksiyonunu kullanıyoruz)
  updateAppMenu();
  
  // Hide window to tray when closed
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
    return true;
  });

  mainWindow.on('ready-to-show', () => {
    // İlk ağılışta pencereyi gizle, ama dil değişiklişi sonrası bu işlem change-language handler'ında ele alınır
    if (!isReloadingForLanguageChange) {
      mainWindow.hide(); // Start minimized in tray
    }
    
    // Index sayfası hazır olduşunda çevirileri gönder (only for the regular index.html)
    if (currentLanguage !== 'en') {
      console.log('Window ready-to-show, will send translations after a delay');
      
      // Give the renderer process a moment to initialize
      setTimeout(() => {
        console.log('Sending initial translations to the window');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('index-translations', translations);
        }
      }, 500);
    }
  });
  
  // Create tray icon
  createTray();
  
  // Register global shortcuts
  registerShortcuts();
  
  // Start clipboard monitoring
  startClipboardMonitoring();
}

// Start monitoring clipboard changes
function startClipboardMonitoring() {
  // Get current clipboard content
  lastClipboardText = clipboard.readText() || '';
  
  // Monitor clipboard changes every 500ms
  clipboardWatcher = setInterval(() => {
    try {
      
      // Only process if text changed and isn't empty
      if (currentText && currentText !== lastClipboardText) {
        lastClipboardText = currentText;
        
        // Klavye kısayollarını ve JSON metinleri filtrele
        if (currentText.match(/ctrl\+shift\+\d/i) || 
            currentText.match(/^\s*\[.*\]\s*$/s)) { // JSON formatında metin
          console.log("Klavye kısayolu veya JSON metni algılandı, göz ardı ediliyor:", currentText.substring(0, 30));
          return;
        }
        
        // Check if this text is already in the top N items (first 9)
        // If so, don't add duplicates that could mess up pin positions
          item.text === currentText && clipboardItems.indexOf(item) < 9
        );
        
        if (existingIndex === -1) {
          // Not in the current visible list, safe to add
          addClipboardItem(currentText);
        }
      }
    } catch (error) {
      console.error('Error reading clipboard:', error);
    }
  }, 500);
}

// Pano izlemesini durdurma fonksiyonu
function stopClipboardMonitoring() {
  if (clipboardWatcher) {
    clearInterval(clipboardWatcher);
    clipboardWatcher = null;
    console.log("Pano izlemesi durduruldu");
  }
}

// Add item to clipboard storage with performance optimizations
function addClipboardItem(text) {
  if (!text) return;
  
  // Check if already exists - use indexed access for better performance
  let existsIndex = -1;
  for (let i = 0; i < clipboardItems.length; i++) {
    if (clipboardItems[i].text === text) {
      existsIndex = i;
      break;
    }
  }
  
  if (existsIndex !== -1) {
    clipboardItems.splice(existsIndex, 1);
  }
  
  // Add to beginning of array
    id: Date.now(),
    text,
    date: new Date().toISOString(),
    pinned: false
  };
  
  clipboardItems.unshift(newItem);
  
  // Limit to 9 items, but preserve pinned items
  if (clipboardItems.length > 9) {
    // Find the first unpinned item from the end
    for (let i = clipboardItems.length - 1; i >= 0; i--) {
      if (!clipboardItems[i].pinned) {
        clipboardItems.splice(i, 1);
        break;
      }
    }
  }
  
  // Ensure pinned items remain at their positions
  reorderPinnedItems();
  
  saveClipboardItems();
}

// Pin an item to a specific position
function pinItemAtPosition(position, itemId) {
  console.log(`Sabitleme başlıyor: Pozisyon ${position}, ID ${itemId}`);
  
  // Everything to number to avoid string/number comparison issues
  position = Number(position);
  itemId = Number(itemId);
  
  // Check if position is valid (1-9)
  if (position < 1 || position > 9) {
    console.log('Geçersiz pozisyon, işlem iptal ediliyor');
    return;
  }
  
  // Sabitlenecek şeyi bul
  if (index === -1) {
    console.log(`ID ${itemId} ile eşleşen şe bulunamadı`);
    return;
  }
  
  // şenin metni
  
  // Sabitlemeden önce filtrele - "sabit N" veya JSON metinlerini reddet
  if (itemText.match(/ctrl\+shift\+\d/i) || 
      itemText.match(/^\s*\[.*\]\s*$/s)) {
    console.log(`Metin "${itemText.substring(0, 30)}" sabitlenemez türden, işlem iptal ediliyor`);
    
    // Bildirim göster
      'app.title',
      'notifications.invalidText',
      false
    );
    notification.show();
    
    return;
  }
  
  console.log(`Sabitlenecek metin: "${itemText.substring(0, 30)}..."`);
  
  // Mevcut sabitlenmiş şeleri kontrol et
  console.log('Mevcut sabitlemeler:', pinnedPositions);
  
  // Benzersiz bir ID oluştur
  
  // Yeni bir şe oluştur, metni koru ama yeni ID ver
    id: newId,
    text: itemText,
    date: new Date().toISOString(),
    pinned: true
  };
  
  // Listeye ekle
  clipboardItems.unshift(newItem);
  
  // Zaten bu pozisyonda sabitlenmiş bir şe var mı kontrol et
  if (oldPinnedId) {
    // Önceki sabitlenmiş şeyi bul ve pinned=false yap
    if (prevIndex !== -1) {
      console.log(`Önceki ${oldPinnedId} ID'li şenin sabitleme durumu kaldırılıyor`);
      clipboardItems[prevIndex].pinned = false;
    }
  }
  
  // Yeni sabitlemeyi kaydet
  console.log(`Yeni ID ${newItem.id} olan şe ${position} pozisyonuna sabitleniyor`);
  pinnedPositions[position] = newItem.id;
  
  // şeleri yeniden sırala
  reorderPinnedItems();
  
  // Metni panoya kopyala
  clipboard.writeText(itemText);
  lastClipboardText = itemText;
  
  // Kullanıcıyı bilgilendir
  if (mainWindow) {
    mainWindow.webContents.send('item-pinned', { 
      position, 
      id: newItem.id,
      pinnedPositions: pinnedPositions
    });
  }
  
  // Sistem bildirimi göster
    'app.title',
    'notifications.pinned',
    false,
    {
      text: `"${itemText.substring(0, 30)}${itemText.length > 30 ? '...' : ''}"`,
      position: position
    }
  );
  notification.show();
}

// Reorder items to ensure pinned items are in their right positions
function reorderPinnedItems() {
  console.log("Sabitlenmiş şeleri yeniden düzenleme başladı");
  console.log("pinnedPositions:", JSON.stringify(pinnedPositions));
  
  // Sadece var olan ID'leri tut
  
  // pinnedPositions içinden var olmayan ID'leri temizle
    if (!existingIds.has(Number(id))) {
      console.log(`ID ${id} olan şe bulunamadı, pozisyon ${position} temizleniyor`);
      delete pinnedPositions[position];
    }
  }
  
  // Önce tüm şelerin pinned durumunu false yap
  clipboardItems.forEach(item => {
    item.pinned = false;
  });
  
  // pinnedPositions içindeki tüm şeleri işaretle
    
    if (index !== -1) {
      clipboardItems[index].pinned = true;
      console.log(`ID ${numId} olan şe pinned=true olarak işaretlendi, pozisyon: ${position}`);
    }
  }
  
  // Yeni bir sıralanmış dizi oluştur
  
  // Pozisyonları sayısal olarak sırala (1,2,3,...,9)
    .map(Number)
    .sort((a, b) => a - b);
  
  // Sabitlenmiş şeleri pozisyon sırasına göre ekle (1'den 9'a)
  for (let pos = 1; pos <= 9; pos++) {
    if (sortedPositions.includes(pos)) {
      
      if (item) {
        reorderedItems.push(item);
        console.log(`Sabitlenen şe (ID:${itemId}) pozisyon ${pos}'e eklendi`);
      }
    }
  }
  
  // Sabitlenmemiş şeleri ekle (yeniden en eskiden en yeniye)
    .filter(item => !item.pinned)
    .sort((a, b) => {
      // Yeni eklenenleri üste yerleştir (tarih sıralaması)
      return new Date(b.date) - new Date(a.date);
    });
  
  // Sabitlenmemiş şeleri ekle
    reorderedItems.push(item);
  }
  
  // Eğer sıralamalarda yer kalırsa, diğer şelerle doldur
  
  // clipboardItems'ı güncelle
  clipboardItems = reorderedItems;
  
  console.log(`reorderPinnedItems tamamlandı, toplam ${clipboardItems.length} şe`);
  
  // Değişiklikleri dosyaya kaydet
  saveToFile();
  
  // Değişiklikleri gönder
  if (mainWindow) {
    mainWindow.webContents.send('clipboard-updated', clipboardItems);
  }
}

function createTray() {
  try {
    // Try to create tray with icon
    tray = new Tray(path.join(__dirname, 'assets/icon.png'));
  } catch (error) {
    console.error('ıkon yüklenemedi:', error);
    // Fallback: Create a blank tray icon
    tray = new Tray(emptyImage);
  }
  
    { 
      label: t('tray.show'), 
      click: () => mainWindow.show() 
    },
    { 
      label: t('tray.quit'), 
      click: () => {
        isQuitting = true;
        app.quit();
      } 
    }
  ]);
  
  tray.setToolTip('MultiCopier');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
}

// Tüm kısayolları yeniden kaydet
function registerShortcuts() {
  // Önceki tüm kısayolları temizle
  globalShortcut.unregisterAll();
  
  // Register app visibility toggle (default: Ctrl+Q)
  globalShortcut.register(shortcutsConfig.toggleAppVisibility, () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  
  // ÖNEMLİ: Önce Ctrl+Shift kısayol tuşlarını kaydet, sonra Ctrl kısayollarını
  // Böylece Shift tuşu basılıyken sadece Ctrl+Shift kısayolu tetiklenir
  
  // 1. Önce Ctrl+Shift+[1-9] kısayollarını kaydet (sabitleme kısayolları)
  for (let i = 1; i <= 9; i++) {
    // Kullanıcının belirlediği sabitleme kısayolunu kullan
    const pinShortcut = `${shortcutsConfig.pinPrefix}${i}`;
    globalShortcut.register(pinShortcut, () => {
      // Sabitleme işlemini gerçekleştir
      // ... (varolan kod)
    });
  }
  
  // 2. Sonra Ctrl+[1-9] kısayollarını kaydet (yapıştırma kısayolları)
  for (let i = 1; i <= 9; i++) {
    // Kullanıcının belirlediği kısayol tuşunu kullan
    const pasteShortcut = `${shortcutsConfig.pastePrefix}${i}`;
    globalShortcut.register(pasteShortcut, () => {
      // Eğer Shift tuşu basılıysa, bu kısayolu işleme - Ctrl+Shift+N için
      if (isShiftKeyPressed()) {
        console.log(`Ctrl+${i} kısayolu yok sayılıyor çünkü Shift tuşu basılı`);
        return;
      }
      
      // Yapıştırma işlemini gerçekleştir
      // ... (varolan kod)
    });
  }
}

// Shift tuşu basılı mı kontrolü
function isShiftKeyPressed() {
  try {
    // Bu fonksiyon Windows için tam olarak çalışmayabilir
    return false;
  } catch (error) {
    console.error('Shift tuşu durumu kontrolünde hata:', error);
    return false;
  }
}

// Save clipboard items and update UI
function saveClipboardItems() {
  // Tutarlılık kontrolü - pinnedPositions'daki şelerin hepsi clipboardItems'da var mı?
  let isConsistent = true;
  
  // Her sabitlenmiş pozisyon için kontrol et
    
    if (!exists) {
      console.warn(`Tutarsızlık: Pozisyon ${pos}'de sabitlenmiş ID ${numId} clipboardItems'da bulunamadı`);
      isConsistent = false;
      delete pinnedPositions[pos]; // Tutarsız kaydı temizle
    }
  }
  
  // Tutarsızlık varsa yeniden düzenle
  if (!isConsistent) {
    console.log("Tutarsızlık tespit edildi, yeniden düzenleniyor");
    reorderPinnedItems();
  }
  
  // Verileri dosyaya kaydet
  saveToFile();
  
  // UI'ı güncelle
  if (mainWindow) {
    console.log(`UI güncelleniyor, ${clipboardItems.length} şe gönderiliyor`);
    console.log(`Sabitlenmiş şeler: ${clipboardItems.filter(i => i.pinned).length}`);
    mainWindow.webContents.send('clipboard-updated', clipboardItems);
  }
}

// IPC communication
ipcMain.on('add-clipboard-item', (event, text) => {
  addClipboardItem(text);
});

ipcMain.on('remove-clipboard-item', (event, id) => {
  // Check if this item is pinned
  if (position) {
    delete pinnedPositions[position];
  }
  
  clipboardItems = clipboardItems.filter(item => item.id !== id);
  saveClipboardItems();
});

ipcMain.on('clear-clipboard-items', () => {
  // Clear all pinned positions
  pinnedPositions = {};
  clipboardItems = [];
  saveClipboardItems();
});

ipcMain.on('get-clipboard-items', (event) => {
  event.reply('clipboard-items', clipboardItems);
});

// Kısayol tuşları yapılandırmasını gönder
ipcMain.on('get-shortcuts-config', (event) => {
  event.reply('shortcuts-config', shortcutsConfig);
  console.log('Kısayol tuşları yapılandırması istemciye gönderildi:', shortcutsConfig);
});

// Kısayol tuşları yapılandırmasını güncelle
ipcMain.on('update-shortcuts-config', (event, newConfig) => {
  console.log('Kısayol tuşları güncelleniyor:', newConfig);
  updateShortcutConfig(newConfig);
});

// Handle new order of items from renderer
ipcMain.on('update-clipboard-items', (event, items) => {
  // Create a mapping of item IDs to their pinned status
    if (item.pinned) {
      pinnedMap[item.id] = true;
    }
  }
  
  // Make a safe copy of pinnedPositions to work with
  
  // Update items while preserving pinned status
    // Get the original pinned status from our mappings
    
    return {
      ...item,
      pinned: isPinned
    };
  });
  
  // Update our clipboard items
  clipboardItems = updatedItems;
  
  // Reset and restore all pinnedPositions mappings
  pinnedPositions = {};
  
  // Restore all position mappings
  Object.entries(currentPinnedPositions).forEach(([position, id]) => {
    
    if (index !== -1) {
      // Restore this pin
      clipboardItems[index].pinned = true;
      pinnedPositions[position] = numericId;
    }
  });
  
  // Make sure pinned items are in their correct positions
  reorderPinnedItems();
  
  saveClipboardItems();
});

ipcMain.on('pin-item', (event, { id, position }) => {
  pinItemAtPosition(position, id);
});

ipcMain.on('unpin-item', (event, id) => {
  // Find which position this item was pinned to
    return Number(pinnedPositions[pos]) === Number(id)
  });
  
  if (position) {
    delete pinnedPositions[position];
    
    // Find the item and mark it as not pinned
    if (index !== -1) {
      clipboardItems[index].pinned = false;
      saveClipboardItems();
    }
  }
});

app.whenReady().then(() => {
  // Önce dosyadan verileri yükle
  initializeStorage();
  
  // IPC işleyicilerini kur
  setupIpcHandlers();
  
  createWindow();
  
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  // Uygulamadan çıkmadan önce verileri kaydet
  saveToFile();
  
  // Clear clipboard watcher
  if (clipboardWatcher) {
    clearInterval(clipboardWatcher);
  }
  
  // Unregister all shortcuts
  globalShortcut.unregisterAll();
});

// Menü şablonu oluştur
function createMenuTemplate() {
  return [
    {
      label: t('menu.file'),
      submenu: [
        {
          label: t('menu.exit'),
          accelerator: process.platform === 'darwin' ? 'Command+Q' : 'Alt+F4',
          click() {
            isQuitting = true;
            app.quit();
          }
        }
      ]
    },
    {
      label: t('menu.edit'),
      submenu: [
        { label: t('menu.cut'), role: 'cut' },
        { label: t('menu.copy'), role: 'copy' },
        { label: t('menu.paste'), role: 'paste' },
        { type: 'separator' },
        { label: t('menu.selectAll'), role: 'selectAll' }
      ]
    },
    {
      label: t('menu.settings'),
      submenu: [
        {
          label: t('menu.shortcuts'),
          click() {
            createShortcutSettingsWindow();
          }
        },
        {
          label: t('menu.language'),
          click() {
            createLanguageSettingsWindow();
          }
        }
      ]
    },
    {
      label: t('menu.help'),
      submenu: [
        {
          label: t('menu.about'),
          click() {
              width: 400,
              height: 600,
              title: t('about.title'),
              parent: mainWindow,
              modal: true,
              resizable: false,
              icon: path.join(__dirname, 'assets/icon.png'),
              webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
              }
            });
            
            aboutWindow.loadFile('about.html');
            aboutWindow.removeMenu();
            
            // Dil değişiklişini about penceresine bildir
            aboutWindow.webContents.on('did-finish-load', () => {
              // About penceresi yüklendişinde çevirileri gönder
              aboutWindow.webContents.send('about-translations', sendAboutTranslations());
            });
          }
        }
      ]
    }
  ];
}

// Kısayol tuşları ayarları penceresi
let shortcutSettingsWindow = null;

function createShortcutSettingsWindow() {
  if (shortcutSettingsWindow) {
    shortcutSettingsWindow.focus();
    return;
  }
  
  shortcutSettingsWindow = new BrowserWindow({
    width: 600,
    height: 500,
    title: t('shortcuts.title'),
    parent: mainWindow,
    modal: true,
    icon: path.join(__dirname, 'assets/icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  shortcutSettingsWindow.loadFile('shortcut-settings.html');
  shortcutSettingsWindow.removeMenu();
  
  shortcutSettingsWindow.on('closed', () => {
    shortcutSettingsWindow = null;
  });
}

// Kısayol tuşlarını güncelle ve yeniden kaydet
function updateShortcutConfig(newConfig) {
  // Geçerli ayarları güncelle
  shortcutsConfig = {
    ...shortcutsConfig,
    ...newConfig
  };
  
  // Dosyaya kaydet
  fs.writeFileSync(shortcutsConfigPath, JSON.stringify(shortcutsConfig, null, 2), 'utf8');
  
  // Kısayolları yeniden kaydet
  registerShortcuts();
  
  // Tüm pencerelere yeni yapılandırmayı bildir
  if (mainWindow) {
    mainWindow.webContents.send('shortcuts-updated', shortcutsConfig);
  }
  
  if (shortcutSettingsWindow) {
    shortcutSettingsWindow.webContents.send('shortcuts-updated', shortcutsConfig);
  }
  
  console.log('Kısayol tuşları güncellendi:', shortcutsConfig);
}

// Dil ayarları penceresi
let languageSettingsWindow = null;

function createLanguageSettingsWindow() {
  if (languageSettingsWindow) {
    languageSettingsWindow.focus();
    return;
  }
  
  languageSettingsWindow = new BrowserWindow({
    width: 500,
    height: 300,
    title: t('language.title'),
    parent: mainWindow,
    modal: true,
    resizable: false,
    icon: path.join(__dirname, 'assets/icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  languageSettingsWindow.loadFile('language-settings.html');
  languageSettingsWindow.removeMenu();
  
  languageSettingsWindow.on('closed', () => {
    languageSettingsWindow = null;
  });
}

// Ana ekranı güncelleme fonksiyonu
function updateAppMenu() {
  Menu.setApplicationMenu(mainMenu);
  
  // Sistem tepsisi menüsünü güncelle
  if (tray) {
      { 
        label: t('tray.show'), 
        click: () => mainWindow.show() 
      },
      { 
        label: t('tray.quit'), 
        click: () => {
          isQuitting = true;
          app.quit();
        } 
      }
    ]);
    tray.setContextMenu(contextMenu);
  }
}

// IPC Handlers için ekleme
// Dil yapılandırmasını gönder
ipcMain.on('get-language-config', (event) => {
  
  // Dil ayarları için çevirileri gönder
    title: t('language.title'),
    selectLanguage: t('language.selectLanguage'),
    restart: t('language.restart'),
    save: t('language.save'),
    cancel: t('language.cancel')
  };
  
  event.reply('language-list', { languages, currentLanguage, translations });
  console.log('Dil yapılandırması istemciye gönderildi:', { languages, currentLanguage });
});

// Dil değiştirme isteğini işle
ipcMain.on('change-language', (event, language) => {
  console.log(`Dil değiştiriliyor: ${language}`);
    // Menüleri güncelle
    updateAppMenu();
    
    // Pencere görünürlük durumunu kaydet
    
    // Dil değişiklişi için yeniden yükleme bayraşını ayarla
    isReloadingForLanguageChange = true;
    
    // Reload the main window with the correct HTML file based on language
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (language === 'en') {
        console.log('Switching to English version (index-en.html)');
        mainWindow.loadFile('index-en.html');
      } else {
        console.log('Switching to Turkish version (index.html)');
        mainWindow.loadFile('index.html');
        
        // For Turkish version, need to send translations after a short delay
        setTimeout(() => {
          console.log('Sending translations after language change');
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('index-translations', translations);
          }
        }, 1000);
      }
      
      // Pencere işerişi yüklendikten sonra pencere görünürlük durumunu geri yükle
      mainWindow.once('ready-to-show', () => {
        console.log('Dil değişiklişi sonrası pencere hazır, görünürlük durumu: ' + isWindowVisible);
        
        if (isWindowVisible) {
          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.show();
              mainWindow.focus();
              console.log('Pencere tekrar gösteriliyor');
            }
          }, 300);
        }
        
        // Dil değişiklişi bayraşını sıfırla
        isReloadingForLanguageChange = false;
      });
    }
    
    // Update any other windows (e.g., about window, settings window)
    BrowserWindow.getAllWindows().forEach(win => {
      if (win !== mainWindow) {
        console.log(`Pencereye dil değişiklişi bildiriliyor: ${win.getTitle()}`);
        win.webContents.send('language-changed', language);
      }
    });
    
    console.log('Dil değişiklişi tamamlandı');
  }
});

// Index sayfası için çevirileri hazırla ve gönder
function sendIndexTranslations(event) {
    app: {
      title: t('app.title'),
      description: t('app.description')
    },
    ui: {
      statusBadge: t('ui.statusBadge'),
      notice: t('ui.notice'),
      addCurrentSelection: t('ui.addCurrentSelection'),
      emptyStateTitle: t('ui.emptyStateTitle'),
      emptyStateDesc: t('ui.emptyStateDesc'),
      shortcutsTitle: t('ui.shortcutsTitle'),
      pinningSectionTitle: t('ui.pinningSectionTitle'),
      autopasteSectionTitle: t('ui.autopasteSectionTitle'),
      dataSectionTitle: t('ui.dataSectionTitle'),
      noClipboardText: t('ui.noClipboardText'),
      confirmClearAll: t('ui.confirmClearAll'),
      copiedToClipboard: t('ui.copiedToClipboard'),
      
      shortcutAppVisibility: t('ui.shortcutAppVisibility'),
      shortcutAutoAdd: t('ui.shortcutAutoAdd'),
      shortcutAutoPaste: t('ui.shortcutAutoPaste'),
      shortcutPinText: t('ui.shortcutPinText'),
      shortcutWith: t('ui.shortcutWith'),
      
      pinningDesc1: t('ui.pinningDesc1'),
      pinningMethodsTitle: t('ui.pinningMethodsTitle'),
      pinningMethod1: t('ui.pinningMethod1'),
      pinningMethod2: t('ui.pinningMethod2'),
      pinningDesc2: t('ui.pinningDesc2'),
      
      autopasteDesc1: t('ui.autopasteDesc1'),
      autopasteDesc2: t('ui.autopasteDesc2'),
      
      dataDesc1: t('ui.dataDesc1'),
      dataDesc2: t('ui.dataDesc2')
    },
    main: {
      clearAll: t('main.clearAll'),
      pin: t('main.pin'),
      unpin: t('main.unpin'),
      delete: t('main.delete')
    },
    // Mevcut dili ekle
  };
  
  if (event) {
    console.log(`çeviriler istemciye gönderiliyor, dil: ${indexTranslations.currentLanguage}`);
    console.log('Örnek çeviri değerleri:', {
      title: indexTranslations.app.title,
      description: indexTranslations.app.description,
      statusBadge: indexTranslations.ui.statusBadge
    });
    
    event.sender.send('index-translations', indexTranslations);
  }
  return indexTranslations;
}

// About sayfası için çevirileri hazırla ve gönder
function sendAboutTranslations(event) {
    app: {
      title: t('app.title'),
      description: t('app.description')
    },
    about: {
      title: t('about.title'),
      version: t('about.version'),
      author: t('about.author'),
      copyright: t('about.copyright'),
      license: t('about.license'),
      aboutTitle: t('about.aboutTitle'),
      aboutContent: t('about.aboutContent'),
      closeButton: t('about.closeButton')
    }
  };
  
  if (event) {
    event.sender.send('about-translations', aboutTranslations);
  }
  return aboutTranslations;
}

// IPC olay dinleyicileri
function setupIpcHandlers() {
  // Mevcut IPC işleyicileri
  
  // Index ve About sayfaları için çeviri işleyicileri
  ipcMain.on('get-index-translations', (event) => {
    console.log('get-index-translations isteşi alındı');
    sendIndexTranslations(event);
  });
  
  ipcMain.on('get-about-translations', (event) => {
    console.log('get-about-translations isteşi alındı');
    sendAboutTranslations(event);
  });
  
  // Shortcut settings sayfası için çeviri işleyicisi
  ipcMain.on('get-shortcuts-translations', (event) => {
    console.log('get-shortcuts-translations isteşi alındı');
    
    // Kısayol ayarları için çevirileri gönder
      title: t('shortcuts.title'),
      visibility: t('shortcuts.visibility'),
      visibilityDesc: t('shortcuts.visibilityDesc'),
      modifier: t('shortcuts.modifier'),
      key: t('shortcuts.key'),
      pasteShortcuts: t('shortcuts.pasteShortcuts'),
      pasteDesc: t('shortcuts.pasteDesc'),
      pinShortcuts: t('shortcuts.pinShortcuts'),
      pinDesc: t('shortcuts.pinDesc'),
      preview: t('shortcuts.preview'),
      warning: t('shortcuts.warning'),
      reset: t('shortcuts.reset'),
      cancel: t('shortcuts.cancel'),
      save: t('shortcuts.save'),
      sameShortcutError: t('shortcuts.sameShortcutError'),
      resetConfirm: t('shortcuts.resetConfirm')
    };
    
    event.reply('shortcuts-translations', shortcutsTranslations);
  });
} 
