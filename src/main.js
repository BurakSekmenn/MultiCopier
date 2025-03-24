const { app, BrowserWindow, clipboard, globalShortcut, ipcMain, Menu, MenuItem, Tray, shell, dialog, nativeImage, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const i18n = require('./i18n');

// Tek instance kontrolü - birden fazla uygulamanın aynı anda çalışmasını engelle
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Eğer kilit alınamadıysa, uygulama zaten çalışıyor demektir, çık
  console.log('Uygulama zaten çalışıyor! İkinci instance kapatılıyor.');
  app.quit();
  return; // Kodu burada sonlandır, ikinci bir instance başlatılmasına izin verme
}

// İkinci bir instance başlatılmaya çalışıldığında, 
// mevcut instance'ta bu fonksiyon çağrılır
app.on('second-instance', (event, commandLine, workingDirectory) => {
  // Pencere varsa onu göster ve öne çıkar
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    
    // Kullanıcıya bildirim göster
    sendAlreadyRunningNotification();
  }
});

// Bildirim gönderme (zaten çalışıyor bilgisi)
function sendAlreadyRunningNotification() {
  const title = t('app.title');
  const body = t('notifications.alreadyRunning');
  
  const notification = new Notification({
    title: title,
    body: body,
    silent: true,
    icon: path.join(__dirname, 'assets/icon.png')
  });
  
  notification.show();
}

// Uygulama adını ayarla
app.setName('MultiCopier');
// Windows 10 bildirimlerinde uygulama kimliğini ayarla
if (process.platform === 'win32') {
  app.setAppUserModelId('com.multicopier.app');
}

// Dil sistemini başlat
i18n.initialize();
const t = i18n.translate; // Daha kısa kullanım için

// Keep a global reference of objects
let mainWindow;
let tray;
let isQuitting = false;
let isReloadingForLanguageChange = false;

// Global değişken - Shift tuşu basılı mı bilgisi
let isShiftKeyDown = false;
let shiftTimer = null;
let lastShiftKeyPressTime = 0; // Yeni değişken: Son Shift tuşuna basma zamanı
let lastShiftShortcutPressed = null; // Yeni değişken: Son basılan Ctrl+Shift+N kombinasyonu

// Dosya yolları
const userDataPath = path.join(app.getPath('userData'), 'data');
const clipboardDataPath = path.join(userDataPath, 'clipboard-data.json');
const pinnedDataPath = path.join(userDataPath, 'pinned-positions.json');
const shortcutsConfigPath = path.join(userDataPath, 'shortcuts-config.json');
const settingsPath = path.join(userDataPath, 'settings.json');

// Clipboard items storage - dosyadan okuma
let clipboardItems = [];

// Pinned items storage
let pinnedPositions = {};
// Maksimum kaç sabitleme yapılabileceğini belirten değişken
const MAX_PINS_PER_POSITION = 3; // Her pozisyona maksimum 3 sabitleme yapılabilir

// Varsayılan kısayol tuşları ayarları
let shortcutsConfig = {
  toggleAppVisibility: 'CommandOrControl+Q',
  pastePrefix: 'CommandOrControl+',
  pinPrefix: 'CommandOrControl+Shift+'
};

// Clipboard monitoring
let lastClipboardText = '';
let clipboardWatcher = null;

// Ayarlar için değişkenler
let maxClipboardItemCount = 9;
let notificationDuration = 3000; // milisaniye (3 saniye)
let showNotifications = true;
let notificationSound = true;

// Basit bildirim gönderme yardımcı fonksiyonu
function showSimpleNotification(title, body, isSilent = false) {
  // Bildirimler kapalıysa gösterme
  if (!showNotifications) {
    console.log('Bildirimler devre dışı');
    return { close: () => {} }; // Boş bildirimi döndür
  }
  
  // Bildirim sesi ayarı
  const silent = isSilent || !notificationSound;
  
  const notification = new Notification({
    title: title,
    body: body,
    silent: silent,
    icon: path.join(__dirname, 'assets/icon.png')
  });
  
  // Bildirim süresine göre otomatik kapatma
  if (notificationDuration > 0) {
    notification.on('show', () => {
      setTimeout(() => {
        notification.close();
      }, notificationDuration);
    });
  }
  
  notification.show();
  return notification;
}

// Dosyaları oluştur ve verileri yükle
function initializeStorage() {
  try {
    // Klasörün var olduğundan emin ol
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    
    // Ayarları yükle
    loadSettings();
    
    // Clipboard verilerini yükle
    if (fs.existsSync(clipboardDataPath)) {
      const data = fs.readFileSync(clipboardDataPath, 'utf8');
      clipboardItems = JSON.parse(data);
      console.log(`${clipboardItems.length} öğe dosyadan yüklendi`);
      
      // Klavye kısayollarını temizle
      const initialCount = clipboardItems.length;
      clipboardItems = clipboardItems.filter(item => {
        // "Ctrl+Shift+1", "Ctrl+Shift+2" vb. metinleri temizle
        return !item.text.match(/ctrl\+shift\+\d/i);
      });
      
      const removedCount = initialCount - clipboardItems.length;
      if (removedCount > 0) {
        console.log(`${removedCount} adet klavye kısayolu metni temizlendi`);
        // Değişiklikleri kaydet
        saveToFile();
      }
    }
    
    // Pinned veri dosyası varsa yükle
    if (fs.existsSync(pinnedDataPath)) {
      const data = fs.readFileSync(pinnedDataPath, 'utf8');
      const loadedPinnedPositions = JSON.parse(data);
      
      // JSON'dan yüklenen değerlerin sayı olduğundan emin ol
      pinnedPositions = {};
      for (const [position, id] of Object.entries(loadedPinnedPositions)) {
        const numPos = Number(position);
        const numId = Number(id);
        
        if (!isNaN(numPos) && !isNaN(numId)) {
          pinnedPositions[numPos] = numId;
        }
      }
      
      console.log(`Sabitlenmiş pozisyon verileri yüklendi:`, pinnedPositions);
      
      // Sabitlenmiş öğeleri işaretle
      for (const [position, id] of Object.entries(pinnedPositions)) {
        const numId = Number(id);
        const index = clipboardItems.findIndex(item => Number(item.id) === numId);
        
        if (index !== -1) {
          clipboardItems[index].pinned = true;
          console.log(`ID ${numId} olan öğe pinned=true olarak işaretlendi, pozisyon: ${position}`);
        }
      }
      
      // Dosyadan yükleme sonrası öğeleri doğru sıraya getir
      reorderPinnedItems();
    }
    
    // Kısayol tuşları ayarlarını yükle
    if (fs.existsSync(shortcutsConfigPath)) {
      const shortcutsData = fs.readFileSync(shortcutsConfigPath, 'utf8');
      const loadedConfig = JSON.parse(shortcutsData);
      
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

// Ayarları yükle
function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      const settings = JSON.parse(data);
      
      // Maksimum pano öğesi sayısı
      if (settings.maxClipboardItems && !isNaN(settings.maxClipboardItems)) {
        maxClipboardItemCount = Number(settings.maxClipboardItems);
      }
      
      // Bildirim ayarları
      if (settings.hasOwnProperty('showNotifications')) {
        showNotifications = settings.showNotifications;
      }
      
      if (settings.hasOwnProperty('notificationSound')) {
        notificationSound = settings.notificationSound;
      }
      
      if (settings.hasOwnProperty('notificationDuration') && !isNaN(settings.notificationDuration)) {
        notificationDuration = Number(settings.notificationDuration) * 1000; // saniyeden milisaniyeye
      }
      
      console.log('Ayarlar yüklendi:', settings);
    } else {
      // Varsayılan ayarları kaydet
      const defaultSettings = {
        maxClipboardItems: maxClipboardItemCount,
        showNotifications: showNotifications,
        notificationSound: notificationSound,
        notificationDuration: notificationDuration / 1000 // milisaniyeden saniyeye
      };
      
      fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2), 'utf8');
      console.log('Varsayılan ayarlar oluşturuldu');
    }
  } catch (error) {
    console.error('Ayarları yükleme hatası:', error);
  }
}

// Verileri dosyaya kaydet
function saveToFile() {
  try {
    // Pozisyon değerlerinin tutarlı olduğundan emin ol
    const cleanPinnedPositions = {};
    for (const pos in pinnedPositions) {
      const numPos = Number(pos);
      const numId = Number(pinnedPositions[pos]);
      if (!isNaN(numPos) && !isNaN(numId)) {
        cleanPinnedPositions[numPos] = numId;
      }
    }
    
    // Temizlenmiş değerleri kullan
    pinnedPositions = cleanPinnedPositions;
    
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
  // PowerShell komutunu doğrudan çalıştırma, geçici dosya yerine
  const psCommand = `powershell -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"`;
  
  // Komutu çalıştır
  exec(psCommand, (error) => {
    if (error) {
      console.error('Paste simulation error:', error);
    }
  });
}

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 800,
    height: 800,
    title: t('app.title'),
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  // Load the index.html of the app
  mainWindow.loadFile(path.join(__dirname, 'html', 'index.html'));
  
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
    // İlk açılışta pencereyi gizle, ama dil değişikliği sonrası bu işlem change-language handler'ında ele alınır
    if (!isReloadingForLanguageChange) {
      mainWindow.hide(); // Start minimized in tray
    }
    
    // Index sayfası hazır olduğunda çevirileri gönder (only for the regular index.html)
    const currentLanguage = i18n.getCurrentLanguage();
    if (currentLanguage !== 'en') {
      console.log('Window ready-to-show, will send translations after a delay');
      
      // Give the renderer process a moment to initialize
      setTimeout(() => {
        console.log('Sending initial translations to the window');
        const translations = sendIndexTranslations();
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
  
  // Uygulama odaklandığında kısayolları yeniden kaydetmeyi dene
  mainWindow.on('focus', () => {
    console.log('Uygulama odaklandı, kısayollar yeniden kontrol ediliyor...');
    // Kısayolları yeniden kaydet - belki sistem artık kısayolları serbest bırakmıştır
    registerShortcuts();
  });
}

// Start monitoring clipboard changes
function startClipboardMonitoring() {
  // Get current clipboard content
  lastClipboardText = clipboard.readText() || '';
  
  // Monitor clipboard changes every 500ms
  clipboardWatcher = setInterval(() => {
    try {
      const currentText = clipboard.readText();
      
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
        const existingIndex = clipboardItems.findIndex(item => 
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
  const newItem = {
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

// Bir öğeyi belirli bir pozisyona sabitle
function pinItemAtPosition(position, itemId) {
  console.log(`PİN İŞLEMİ: ID ${itemId} öğesi pozisyon ${position}'e sabitleniyor`);
  
  // Pozisyonu sayıya dönüştür
  position = Number(position);
  itemId = Number(itemId);
  
  // Pozisyon geçerli aralıkta mı kontrol et
  if (position < 1 || position > 9) {
    console.error(`Geçersiz pozisyon: ${position} (1-9 arasında olmalı)`);
    return false;
  }
  
  // Öğe geçerli mi kontrol et
  const itemToPin = clipboardItems.find(item => Number(item.id) === itemId);
  if (!itemToPin) {
    console.error(`ID ${itemId} olan öğe bulunamadı`);
    return false;
  }
  
  // Öğe metni var mı?
  if (!itemToPin.text || typeof itemToPin.text !== 'string') {
    console.error(`ID ${itemId} olan öğenin geçerli bir metni yok`);
    return false;
  }
  
  // Bu öğe başka bir pozisyona sabitlenmiş mi kontrol et?
  let oldPosition = null;
  
  for (const pos in pinnedPositions) {
    if (Number(pinnedPositions[pos]) === itemId) {
      oldPosition = Number(pos);
      // Mevcut sabitlemesini kaldır
      console.log(`ID ${itemId} öğesi zaten pozisyon ${oldPosition}'e sabitlenmiş. Eski konumdan kaldırılıyor.`);
      
      // Eğer aynı pozisyona sabitlenmek isteniyorsa, işlemi iptal et
      if (oldPosition === position) {
        console.warn(`ID ${itemId} öğesi zaten pozisyon ${position}'e sabitlenmiş. İşlem iptal ediliyor.`);
        return true; // Zaten sabitlenmiş
      }
      
      delete pinnedPositions[oldPosition];
      break;
    }
  }
  
  // Pozisyon zaten başka bir öğe tarafından kullanılıyor mu?
  if (pinnedPositions[position]) {
    const oldItemId = pinnedPositions[position];
    console.log(`Pozisyon ${position} zaten ID ${oldItemId} öğesi tarafından kullanılıyor. Eski öğenin sabitlemesi kaldırılıyor.`);
    
    // Bu pozisyondaki öğeyi bul
    const oldItem = clipboardItems.find(item => Number(item.id) === Number(oldItemId));
    if (oldItem) {
      // Öğenin sabitlenmesini kaldır
      oldItem.pinned = false;
      console.log(`ID ${oldItemId} öğesinin sabitlemesi kaldırıldı`);
    }
  }
  
  // Yeni pozisyonu kaydet
  pinnedPositions[position] = itemId;
  
  // Öğeyi sabitlenmiş olarak işaretle
  itemToPin.pinned = true;
  
  // LocalStorage'ı güncelle
  saveClipboardItems();
  saveSettings();
  
  // Durum kontrolü
  console.log(`Sabitleme sonrası pinnedPositions:`, JSON.stringify(pinnedPositions));
  
  // Tüm pencerelere bilgi gönder
  if (mainWindow && !mainWindow.isDestroyed()) {
    console.log(`Güncellenmiş pinnedPositions ve öğeler UI'a gönderiliyor`);
    
    // Önce öğe durumunu gönder
    mainWindow.webContents.send('clipboard-updated', clipboardItems);
    
    // Sonra sabitlenmiş pozisyonları gönder
    mainWindow.webContents.send('pinned-positions', pinnedPositions);
    
    // Bildirim mesajı gönder
    mainWindow.webContents.send('item-pinned', { 
      position: position, 
      id: itemId, 
      pinnedPositions: pinnedPositions 
    });
  } else {
    console.error('Ana pencere bulunamadı, güncellemeler gönderilemedi!');
  }
  
  // Global kısayolu güncelle
  updateGlobalShortcuts();
  
  // Kısayolu güncelle
  createLocalShortcutForPaste(position, itemToPin.text);
  
  console.log(`ID ${itemId} öğesi başarıyla pozisyon ${position}'e sabitlendi. Pinned değeri: ${itemToPin.pinned}`);
  
  return true;
}

// Reorder items to ensure pinned items are in their right positions
function reorderPinnedItems() {
  console.log("Sabitlenmiş öğeleri yeniden düzenleme başladı");
  console.log("pinnedPositions:", JSON.stringify(pinnedPositions));
  
  // Sadece var olan ID'leri tut
  const existingIds = new Set(clipboardItems.map(item => Number(item.id)));
  
  // pinnedPositions içinden var olmayan ID'leri temizle ve tüm pozisyon/id değerlerinin sayı olduğundan emin ol
  const cleanedPositions = {};
  for (const position in pinnedPositions) {
    const numPos = Number(position);
    const numId = Number(pinnedPositions[position]);
    
    // Geçerli sayısal değerler ve varolan ID'ler için devam et
    if (!isNaN(numPos) && !isNaN(numId) && existingIds.has(numId)) {
      cleanedPositions[numPos] = numId;
    } else {
      console.log(`Pozisyon ${position} temizlendi: NumPos=${numPos}, NumId=${numId}, Exists=${existingIds.has(numId)}`);
    }
  }
  
  // Temizlenmiş değerleri kullan
  pinnedPositions = cleanedPositions;
  
  // Önce tüm öğelerin pinned durumunu false yap
  clipboardItems.forEach(item => {
    item.pinned = false;
  });
  
  // pinnedPositions içindeki tüm öğeleri işaretle
  for (const position in pinnedPositions) {
    const numId = pinnedPositions[position]; // Artık temizlenmiş, sayısal değerler
    const index = clipboardItems.findIndex(item => Number(item.id) === numId);
    
    if (index !== -1) {
      clipboardItems[index].pinned = true;
      console.log(`ID ${numId} olan öğe pinned=true olarak işaretlendi, pozisyon: ${position}`);
    }
  }
  
  // Yeni bir sıralanmış dizi oluştur
  const reorderedItems = [];
  
  // Pozisyonları sayısal olarak sırala (1,2,3,...,9)
  const sortedPositions = Object.keys(pinnedPositions)
    .map(Number)
    .sort((a, b) => a - b);
  
  // Sabitlenmiş öğeleri pozisyon sırasına göre ekle (1'den 9'a)
  for (let pos = 1; pos <= 9; pos++) {
    if (sortedPositions.includes(pos)) {
      const itemId = pinnedPositions[pos]; // Artık sayısal değer
      const item = clipboardItems.find(item => Number(item.id) === itemId);
      
      if (item) {
        reorderedItems.push(item);
        console.log(`Sabitlenen öğe (ID:${itemId}) pozisyon ${pos}'e eklendi`);
      }
    }
  }
  
  // Sabitlenmemiş öğeleri ekle (yeniden en eskiden en yeniye)
  const unpinnedItems = clipboardItems
    .filter(item => !item.pinned)
    .sort((a, b) => {
      // Yeni eklenenleri üste yerleştir (tarih sıralaması)
      return new Date(b.date) - new Date(a.date);
    });
  
  // Sabitlenmemiş öğeleri ekle
  for (const item of unpinnedItems) {
    reorderedItems.push(item);
  }
  
  // clipboardItems'ı güncelle
  clipboardItems = reorderedItems;
  
  console.log(`reorderPinnedItems tamamlandı, toplam ${clipboardItems.length} öğe`);
  
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
    console.error('İkon yüklenemedi:', error);
    // Fallback: Create a blank tray icon
    const { nativeImage } = require('electron');
    const emptyImage = nativeImage.createEmpty();
    tray = new Tray(emptyImage);
  }
  
  const contextMenu = Menu.buildFromTemplate([
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
  // Tüm mevcut kısayolları temizle
  globalShortcut.unregisterAll();
  console.log("Tüm kısayollar sıfırlandı");
  
  // ÖNEMLİ: Önce sabitleme kısayollarını kaydedelim (Sabitleme kısayolları öncelikli)
  console.log("Sabitleme kısayolları kaydediliyor...");
  
  // Sabitleme kısayolları (Ctrl+Shift+1, Ctrl+Shift+2, vb.)
  for (let i = 1; i <= 9; i++) {
    // i değerini doğrudan burada kopyalayalım, kapanış kapsamı sorunu yaşanmaması için
    const currentPosition = i;
    const pinShortcut = `${shortcutsConfig.pinPrefix}${currentPosition}`;
    
    // Sabitleme kısayolunu kaydet - try/catch ile kayıt hatalarını yakala
    try {
      const registered = globalShortcut.register(pinShortcut, () => {
        console.log(`${pinShortcut} kısayolu tetiklendi - pozisyon: ${currentPosition}`);
        
        // Son basılan Ctrl+Shift+N kombinasyonunu kaydet
        lastShiftShortcutPressed = currentPosition;
        lastShiftKeyPressTime = Date.now();
        
        // Bu tam olarak hangi pozisyona sabitlenecek - doğrudan kopyaladığımız değeri kullanıyoruz
        handlePinShortcut(currentPosition);
      });
      
      if (registered) {
        console.log(`${pinShortcut} kısayolu başarıyla kaydedildi ve pozisyon ${currentPosition} ile eşlendi`);
      } else {
        console.error(`${pinShortcut} kısayolu kaydedilemedi! Sistem tarafından zaten kullanılıyor olabilir.`);
        // Burada uygulama içi bir kısayol olarak kaydedilebilir
        createLocalShortcutForPin(currentPosition);
      }
    } catch (error) {
      console.error(`${pinShortcut} kısayolunu kaydederken hata oluştu:`, error);
      // Burada uygulama içi bir kısayol olarak kaydedilebilir
      createLocalShortcutForPin(currentPosition);
    }
  }
  
  // Kısa bir bekleme ekleyerek önce Shift kısayollarının tamamen kaydolmasını sağla
  setTimeout(() => {
    console.log("Yapıştırma kısayolları kaydediliyor...");
    
    // Uygulama görünürlüğünü değiştiren kısayol
    try {
      const toggleRegistered = globalShortcut.register(shortcutsConfig.toggleAppVisibility, () => {
        if (mainWindow) {
          if (mainWindow.isVisible()) {
            mainWindow.hide();
          } else {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      });
      
      if (!toggleRegistered) {
        console.error(`${shortcutsConfig.toggleAppVisibility} görünürlük kısayolu kaydedilemedi! Sistem tarafından zaten kullanılıyor olabilir.`);
        // Yerel bir menü kısayolu olarak kaydedilmeli
        createLocalShortcutForToggle();
      }
    } catch (error) {
      console.error(`Görünürlük kısayolunu kaydederken hata oluştu:`, error);
      createLocalShortcutForToggle();
    }
    
    // Yapıştırma kısayolları (Ctrl+1, Ctrl+2, vb.)
    for (let i = 1; i <= 9; i++) {
      // i değerini doğrudan burada kopyalayalım, kapanış kapsamı sorunu yaşanmaması için
      const currentPosition = i;
      const pasteShortcut = `${shortcutsConfig.pastePrefix}${currentPosition}`;
      
      // Yapıştırma kısayolunu kaydet
      try {
        const registered = globalShortcut.register(pasteShortcut, () => {
          // Son 1000ms içinde bir Ctrl+Shift+N kombinasyonu basıldı mı kontrol et
          const timeSinceLastShift = Date.now() - lastShiftKeyPressTime;
          
          // Eğer son basılan Ctrl+Shift+N kombinasyonu bu tuş ile aynı ise yapıştırma yapma
          if (lastShiftShortcutPressed === currentPosition && timeSinceLastShift < 1000) {
            console.log(`${pasteShortcut} kısayolu yok sayılıyor çünkü az önce ${shortcutsConfig.pinPrefix}${currentPosition} basıldı`);
            
            // Son basılan Ctrl+Shift+N kombinasyonunu sıfırla ve devam etme
            lastShiftShortcutPressed = null;
            return;
          }
          
          // Normal yapıştırma işlemine devam et
          console.log(`${pasteShortcut} kısayolu tetiklendi - pozisyon: ${currentPosition}'den yapıştırma yapılacak`);
          handlePasteShortcut(currentPosition);
        });
        
        if (registered) {
          console.log(`${pasteShortcut} kısayolu başarıyla kaydedildi ve pozisyon ${currentPosition} ile eşlendi`);
        } else {
          console.error(`${pasteShortcut} kısayolu kaydedilemedi! Sistem tarafından zaten kullanılıyor olabilir.`);
          // Burada uygulama içi bir kısayol olarak kaydedilebilir
          createLocalShortcutForPaste(currentPosition);
        }
      } catch (error) {
        console.error(`${pasteShortcut} kısayolunu kaydederken hata oluştu:`, error);
        // Burada uygulama içi bir kısayol olarak kaydedilebilir
        createLocalShortcutForPaste(currentPosition);
      }
    }
    
    console.log("Tüm kısayollar kaydedildi.");
  }, 100); // 100ms bekleyerek önce Shift kısayollarının kaydedilmesini sağla
}

// Uygulama içi kısayol tuşları için yardımcı fonksiyonlar
function createLocalShortcutForPin(position) {
  // Pozisyonu sayıya dönüştürdüğümüzden emin olalım
  position = Number(position);
  
  console.log(`Pozisyon ${position} için yerel sabitleme kısayolu oluşturuluyor...`);
  
  // Bunu ana menüye ekleyebiliriz
  if (mainWindow) {
    // Elektronun menü API'sini kullanarak yerel menü kısayolu ekle
    const menuItem = {
      label: `Pozisyon ${position}'e Sabitle`,
      accelerator: `${shortcutsConfig.pinPrefix}${position}`,
      click: () => handlePinShortcut(position)
    };
    
    // Mevcut menüye yeni öğeyi ekle
    addMenuItemSafely(menuItem);
    
    // Kullanıcıya bildir
    mainWindow.webContents.send('shortcut-changed-to-local', {
      type: 'pin',
      position: position,
      shortcut: `${shortcutsConfig.pinPrefix}${position}`
    });
  }
}

function createLocalShortcutForPaste(position) {
  // Pozisyonu sayıya dönüştürdüğümüzden emin olalım
  position = Number(position);
  
  console.log(`Pozisyon ${position} için yerel yapıştırma kısayolu oluşturuluyor...`);
  
  // Bunu ana menüye ekleyebiliriz
  if (mainWindow) {
    // Elektronun menü API'sini kullanarak yerel menü kısayolu ekle
    const menuItem = {
      label: `Pozisyon ${position}'den Yapıştır`,
      accelerator: `${shortcutsConfig.pastePrefix}${position}`,
      click: () => handlePasteShortcut(position)
    };
    
    // Mevcut menüye yeni öğeyi ekle
    addMenuItemSafely(menuItem);
    
    // Kullanıcıya bildir
    mainWindow.webContents.send('shortcut-changed-to-local', {
      type: 'paste',
      position: position,
      shortcut: `${shortcutsConfig.pastePrefix}${position}`
    });
  }
}

function createLocalShortcutForToggle() {
  console.log(`Görünürlük için yerel kısayol oluşturuluyor...`);
  
  // Bunu ana menüye ekleyebiliriz - zaten orada olabilir
  if (mainWindow) {
    // Elektronun menü API'sini kullanarak yerel menü kısayolu ekle
    const menuItem = {
      label: t('tray.show'),
      accelerator: shortcutsConfig.toggleAppVisibility,
      click: () => {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    };
    
    // Mevcut menüye yeni öğeyi ekle
    addMenuItemSafely(menuItem);
    
    // Kullanıcıya bildir
    mainWindow.webContents.send('shortcut-changed-to-local', {
      type: 'toggle',
      shortcut: shortcutsConfig.toggleAppVisibility
    });
  }
}

// Mevcut menüye güvenli şekilde öğe eklemek için yardımcı fonksiyon
function addMenuItemSafely(menuItem) {
  try {
    // Mevcut menüyü al
    const currentMenu = Menu.getApplicationMenu();
    if (!currentMenu) {
      // Menü yoksa yeni bir menü oluştur
      const newMenu = new Menu();
      newMenu.append(new MenuItem(menuItem));
      Menu.setApplicationMenu(newMenu);
      return;
    }
    
    // Mevcut menü öğelerinden kopya oluştur
    const template = currentMenu.items.map(item => {
      return item;
    });
    
    // Özel menü öğesini uygun bir yere ekleyelim - genelde Düzen (Edit) menüsü
    let editMenuFound = false;
    for (let i = 0; i < template.length; i++) {
      if (template[i].label === t('menu.edit') || template[i].label === 'Edit') {
        // Edit menüsünün alt menüsü
        const submenu = template[i].submenu.items.map(item => item);
        submenu.push(new MenuItem({ type: 'separator' }));
        submenu.push(new MenuItem(menuItem));
        template[i].submenu = Menu.buildFromTemplate(submenu);
        editMenuFound = true;
        break;
      }
    }
    
    // Edit menüsü bulunamadıysa, Ana menüye ekleyelim
    if (!editMenuFound) {
      template.push(new MenuItem(menuItem));
    }
    
    // Güncellenmiş menüyü ayarla
    const newMenu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(newMenu);
  } catch (error) {
    console.error('Menü öğesi eklenirken hata oluştu:', error);
  }
}

// Sabitleme işlemleri için kaydedilen kısayol olay dinleyicisi
function handlePinShortcut(i) {
  // Sabitlenecek pozisyonu açık şekilde belirle ve logla (hata ayıklama için)
  const positionToPin = Number(i); // Pozisyonu Number'a dönüştürdüğümüzden emin olalım
  
  console.log(`------------------------------`);
  console.log(`Sabitleme kısayolu çalıştırılıyor. İstenen pozisyon: ${positionToPin}`);
  console.log(`Geçirilen parametre: ${i}, Tür: ${typeof i}`);
  console.log(`Dönüştürülmüş pozisyon: ${positionToPin}, Tür: ${typeof positionToPin}`);
  console.log(`------------------------------`);
  
  // PowerShell komutunu çalıştır (Ctrl+C simülasyonu)
  const psCommand = `powershell -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^c')"`;
  
  exec(psCommand, (error) => {
    if (error) {
      console.error('Kopyalama simülasyonu hatası:', error);
      return;
    }
    
    // Kopyalama işlemi tamamlandıktan sonra, kısa bir bekleme ekle
    setTimeout(() => {
      // Şimdi panodan metni oku
      const currentText = clipboard.readText();
      
      if (!currentText) {
        console.log(`Sabitleme başarısız: Pano boş veya kopyalama işlemi başarısız (Pozisyon: ${positionToPin})`);
        
        // Sistem bildirimi göster
        showSimpleNotification(
          t('app.title'),
          t('notifications.copyFailed'),
          false
        );
        
        return;
      }
      
      console.log(`Ctrl+Shift+${positionToPin} kısayolu tetiklendi. Kesinlikle pozisyon ${positionToPin}'e metin sabitleniyor...`);
      
      // ADIM 1: Sabitlemek istediğimiz metni clipboardItems'da bul veya yeni oluştur
      let foundItem = clipboardItems.find(item => item.text === currentText);
      
      if (!foundItem) {
        // Bu metin daha önce listeye eklenmemiş, yeni oluştur
        foundItem = {
          id: Date.now(),
          text: currentText,
          date: new Date().toISOString(),
          pinned: true  // Öğe sabitlenmiş olarak işaretle
        };
        console.log(`Yeni öğe oluşturuldu, ID: ${foundItem.id}`);
      } else {
        // Mevcut öğeyi sabitle
        foundItem.pinned = true;
        // Mevcut öğeyi clipboardItems'dan kaldır - daha sonra başa eklenecek
        clipboardItems = clipboardItems.filter(item => item.text !== currentText);
        console.log(`Mevcut öğe bulundu, ID: ${foundItem.id}`);
      }
      
      // ADIM 2: Önceki pozisyonda sabitlenmiş bir öğe var mı kontrol et
      const oldPinnedId = pinnedPositions[positionToPin];
      if (oldPinnedId) {
        // Önceki sabitlenmiş öğeyi bul ve pinned=false yap
        const oldItemIndex = clipboardItems.findIndex(item => Number(item.id) === Number(oldPinnedId));
        if (oldItemIndex !== -1) {
          console.log(`Pozisyon ${positionToPin} güncelleniyor. Eski ${oldPinnedId} ID'li öğenin sabitleme durumu kaldırılıyor`);
          clipboardItems[oldItemIndex].pinned = false;
        }
      }
      
      // ADIM 3: Yeni öğeyi sabitle - doğrudan ID'yi kaydet, dizi kullanma
      console.log(`ID: ${foundItem.id} olan metin kesinlikle pozisyon ${positionToPin}'e sabitleniyor`);
      pinnedPositions[positionToPin] = Number(foundItem.id);
      
      // Kontrol ve hata ayıklama için pinnedPositions'ı yazdır
      console.log('Güncellenmiş pinnedPositions:', JSON.stringify(pinnedPositions));
      
      // ADIM 4: Yeni öğeyi listeye ekle
      clipboardItems.unshift(foundItem);
      
      // ADIM 5: Öğeleri yeniden sırala ve kaydet
      reorderPinnedItems();
      
      // ADIM 6: Metni panoya kopyala
      clipboard.writeText(foundItem.text);
      // Şimdi lastClipboardText'i güncelle
      lastClipboardText = foundItem.text;
      
      // ADIM 7: Bildirim göster
      if (mainWindow && mainWindow.isVisible()) {
        mainWindow.webContents.send('item-pinned', { 
          position: positionToPin, 
          id: foundItem.id,
          pinnedPositions: pinnedPositions
        });
      }
      
      // Sistem bildirimi göster
      const shortText = currentText.length > 30 ? currentText.substring(0, 30) + '...' : currentText;
      showSimpleNotification(
        t('app.title'),
        t('notifications.pinned', { text: shortText, position: positionToPin }),
        false
      );
      
      console.log(`Sabitleme işlemi tamamlandı: Pozisyon ${positionToPin} için, ID: ${foundItem.id}`);
    }, 100); // 100ms bekleme süresi
  });
}

// Basit bildirim gönderme yardımcı fonksiyonu
function showSimpleNotification(title, body, isSilent = false) {
  const notification = new Notification({
    title: title,
    body: body,
    silent: isSilent,
    icon: path.join(__dirname, 'assets/icon.png')
  });
  
  notification.show();
  return notification;
}

// Yapıştırma işlemleri için kaydedilen kısayol olay dinleyicisi
function handlePasteShortcut(i) {
  // Pozisyonu açık şekilde belirle
  const positionToPaste = Number(i); // Pozisyonu Number'a dönüştürdüğümüzden emin olalım
  
  console.log(`------------------------------`);
  console.log(`Yapıştırma kısayolu çalıştırılıyor. İstenen pozisyon: ${positionToPaste}`);
  console.log(`Geçirilen parametre: ${i}, Tür: ${typeof i}`);
  console.log(`Dönüştürülmüş pozisyon: ${positionToPaste}, Tür: ${typeof positionToPaste}`);
  console.log(`------------------------------`);
  
  let item = null;
  
  // ADIM 1: Öncelikle bu pozisyonda sabitlenmiş öğe var mı kontrol et
  const pinnedItemId = pinnedPositions[positionToPaste];
  if (pinnedItemId) {
    // Sabitlenmiş öğeyi bul
    const pinnedIndex = clipboardItems.findIndex(item => Number(item.id) === Number(pinnedItemId));
    
    if (pinnedIndex !== -1) {
      item = clipboardItems[pinnedIndex];
      console.log(`ÖNCELİKLİ: Pozisyon ${positionToPaste}'de sabitlenmiş öğe kullanılıyor: ID ${pinnedItemId}, Text: ${item.text.substring(0, 20)}`);
    } else {
      console.log(`Pozisyon ${positionToPaste}'de sabitlenmiş öğe (ID: ${pinnedItemId}) bulunamadı, normal sıralı öğe kullanılacak`);
      
      // ADIM 2: Sabitlenmiş pozisyonları belirle
      const usedPositions = {};
      for (const pos in pinnedPositions) {
        usedPositions[pos] = true;
      }
      
      // ADIM 3: Bu pozisyona karşılık gelen normal liste öğesini bul
      // Çakışma olmaması için sabitlenmiş öğeleri atlayarak pozisyon belirleyelim
      let normalIndex = 0;
      let currentPosition = 1;
      
      while (currentPosition <= positionToPaste && normalIndex < clipboardItems.length) {
        // Sabitlenmiş pozisyonları atla
        if (!usedPositions[currentPosition]) {
          normalIndex++;
          currentPosition++;
        } else {
          // Bu pozisyon sabitlenmiş, sadece pozisyonu arttır
          currentPosition++;
        }
      }
      
      // Pozisyona karşılık gelen öğeyi bul (index = pozisyon - 1)
      normalIndex = normalIndex - 1;
      
      if (normalIndex >= 0 && normalIndex < clipboardItems.length) {
        // Bu pozisyona karşılık gelen öğeyi bul
        // Sabitlenmiş öğeleri atla
        let actualIndex = 0;
        let foundCount = 0;
        
        for (let i = 0; i < clipboardItems.length; i++) {
          // Sabitlenmiş öğeleri atla
          if (!clipboardItems[i].pinned) {
            if (foundCount === normalIndex) {
              actualIndex = i;
              break;
            }
            foundCount++;
          }
        }
        
        if (actualIndex < clipboardItems.length) {
          item = clipboardItems[actualIndex];
          console.log(`Normal sıradaki öğe kullanılıyor (sabitlenmiş öğeler hariç): Sıra ${normalIndex}, ID ${item ? item.id : 'bulunamadı'}`);
        }
      }
    }
  } else {
    console.log(`Pozisyon ${positionToPaste} için sabitlenmiş öğe yok, normal sıralı öğe kullanılacak`);
    
    // Debug için mevcut pinnedPositions durumunu göster
    console.log('Mevcut pinnedPositions:', JSON.stringify(pinnedPositions));
    
    // ADIM 2: Sabitlenmiş pozisyonları belirle
    const usedPositions = {};
    for (const pos in pinnedPositions) {
      usedPositions[pos] = true;
    }
    
    // ADIM 3: Bu pozisyona karşılık gelen normal liste öğesini bul
    // Çakışma olmaması için sabitlenmiş öğeleri atlayarak pozisyon belirleyelim
    let normalIndex = 0;
    let currentPosition = 1;
    
    while (currentPosition <= positionToPaste && normalIndex < clipboardItems.length) {
      // Sabitlenmiş pozisyonları atla
      if (!usedPositions[currentPosition]) {
        normalIndex++;
        currentPosition++;
      } else {
        // Bu pozisyon sabitlenmiş, sadece pozisyonu arttır
        currentPosition++;
      }
    }
    
    // Pozisyona karşılık gelen öğeyi bul (index = pozisyon - 1)
    normalIndex = normalIndex - 1;
    
    if (normalIndex >= 0 && normalIndex < clipboardItems.length) {
      // Bu pozisyona karşılık gelen öğeyi bul
      // Sabitlenmiş öğeleri atla
      let actualIndex = 0;
      let foundCount = 0;
      
      for (let i = 0; i < clipboardItems.length; i++) {
        // Sabitlenmiş öğeleri atla
        if (!clipboardItems[i].pinned) {
          if (foundCount === normalIndex) {
            actualIndex = i;
            break;
          }
          foundCount++;
        }
      }
      
      if (actualIndex < clipboardItems.length) {
        item = clipboardItems[actualIndex];
        console.log(`Normal sıradaki öğe kullanılıyor (sabitlenmiş öğeler hariç): Sıra ${normalIndex}, ID ${item ? item.id : 'bulunamadı'}`);
      }
    }
  }
  
  // ADIM 4: Eğer hiçbir öğe bulunamadıysa işlemi sonlandır
  if (!item) {
    console.log(`Yapıştırılacak öğe bulunamadı. Toplam öğe sayısı: ${clipboardItems.length}, istenen pozisyon: ${positionToPaste}`);
    return;
  }
  
  // Seçilen öğe hakkında bilgi ver
  const itemId = Number(item.id);
  const isPinned = item.pinned;
  console.log(`Seçilen öğe: "${item.text.substring(0, 20)}..." (Sabitli: ${isPinned ? 'Evet' : 'Hayır'})`);
  
  // Pano izlemeyi geçici olarak devre dışı bırak
  const wasMonitoring = clipboardWatcher !== null;
  if (wasMonitoring) {
    clearInterval(clipboardWatcher);
    clipboardWatcher = null;
  }
  
  // Seçilen öğeyi panoya kopyala
  clipboard.writeText(item.text);
  lastClipboardText = item.text; // Son bilinen metni güncelle
  
  // Ctrl+V simülasyonu ile yapıştır
  setTimeout(() => {
    simulatePaste();
  }, 100); // Panonun metni alması için kısa bir gecikme
  
  // Tüm işlemlerden sonra öğenin sabitleme durumunu koru
  setTimeout(() => {
    // Tüm sabitlenmiş öğelerin durumunu tekrar kontrol et
    for (const pos in pinnedPositions) {
      const id = pinnedPositions[pos];
      const index = clipboardItems.findIndex(item => Number(item.id) === Number(id));
      if (index !== -1) {
        clipboardItems[index].pinned = true;
      }
    }
    
    // Eğer pano izleme aktifse, tekrar başlat
    if (wasMonitoring && clipboardWatcher === null) {
      startClipboardMonitoring();
    }
    
    // Öğeleri yeniden sırala ve kaydet
    reorderPinnedItems();
    saveClipboardItems();
  }, 300);
  
  // Yapıştırma bildirimi göster
  if (mainWindow && mainWindow.isVisible()) {
    mainWindow.webContents.send('item-pasted', positionToPaste);
  } else {
    // Uygulama penceresi görünür değilse sistem bildirimi göster
    const shortText = item.text.length > 30 ? item.text.substring(0, 30) + '...' : item.text;
    showSimpleNotification(
      t('app.title'),
      t('notifications.pasted', { text: shortText }),
      true
    );
  }
}

// Save clipboard items and update UI
function saveClipboardItems() {
  // Tutarlılık kontrolü - pinnedPositions'daki öğelerin hepsi clipboardItems'da var mı?
  let isConsistent = true;
  
  // Her sabitlenmiş pozisyon için kontrol et
  for (const pos in pinnedPositions) {
    const numId = Number(pinnedPositions[pos]);
    const exists = clipboardItems.some(item => Number(item.id) === numId);
    
    if (!exists) {
      console.warn(`Tutarsızlık: Pozisyon ${pos}'de sabitlenmiş ID ${numId} clipboardItems'da bulunamadı`);
      isConsistent = false;
      delete pinnedPositions[Number(pos)]; // Tutarsız kaydı temizle
    }
  }
  
  // Pozisyonların sayı olduğundan emin ol
  const numberPosMap = {};
  for (const [pos, id] of Object.entries(pinnedPositions)) {
    const numPos = Number(pos);
    if (!isNaN(numPos)) {
      numberPosMap[numPos] = Number(id);
    }
  }
  pinnedPositions = numberPosMap;
  
  // Tutarsızlık varsa yeniden düzenle
  if (!isConsistent) {
    console.log("Tutarsızlık tespit edildi, yeniden düzenleniyor");
    reorderPinnedItems();
  }
  
  // Verileri dosyaya kaydet
  saveToFile();
  
  // UI'ı güncelle
  if (mainWindow) {
    console.log(`UI güncelleniyor, ${clipboardItems.length} öğe gönderiliyor`);
    console.log(`Sabitlenmiş öğeler: ${clipboardItems.filter(i => i.pinned).length}`);
    mainWindow.webContents.send('clipboard-updated', clipboardItems);
  }
}

// IPC communication
ipcMain.on('add-clipboard-item', (event, text) => {
  addClipboardItem(text);
});

ipcMain.on('remove-clipboard-item', (event, id) => {
  const numId = Number(id);
  
  // Check if this item is pinned
  const position = Object.keys(pinnedPositions).find(pos => pinnedPositions[pos] === numId);
  if (position) {
    delete pinnedPositions[Number(position)];
  }
  
  clipboardItems = clipboardItems.filter(item => Number(item.id) !== numId);
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
  const pinnedMap = {};
  for (const item of clipboardItems) {
    if (item.pinned) {
      pinnedMap[item.id] = true;
    }
  }
  
  // Make a safe copy of pinnedPositions to work with
  const currentPinnedPositions = {...pinnedPositions};
  
  // Update items while preserving pinned status
  const updatedItems = items.map(item => {
    // Get the original pinned status from our mappings
    const isPinned = pinnedMap[item.id] || false;
    
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
    const numericId = Number(id);
    const index = clipboardItems.findIndex(item => item.id === numericId);
    
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
  let positionToUpdate = null;
  const numId = Number(id);
  
  // Tüm pozisyonları kontrol et
  for (const pos in pinnedPositions) {
    if (pinnedPositions[pos] === numId) {
      positionToUpdate = Number(pos);
      break;
    }
  }
  
  if (positionToUpdate !== null) {
    // Pozisyondan tamamen kaldır
    delete pinnedPositions[positionToUpdate];
    
    // Öğeyi bul ve pinned=false yap
    const index = clipboardItems.findIndex(item => Number(item.id) === numId);
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
            createAboutWindow();
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
    height: 700,
    title: t('shortcuts.title'),
    parent: mainWindow,
    modal: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  shortcutSettingsWindow.loadFile(path.join(__dirname, 'html', 'shortcut-settings.html'));
  shortcutSettingsWindow.removeMenu();
  
  shortcutSettingsWindow.on('closed', () => {
    shortcutSettingsWindow = null;
  });
}

// Kısayol tuşlarını güncelle ve yeniden kaydet
function updateShortcutConfig(newConfig) {
  console.log('Yeni ayarlar alındı:', newConfig);
  
  // Geçerli ayarları güncelle
  shortcutsConfig = {
    ...shortcutsConfig,
    ...newConfig
  };
  
  // Dosyaya kaydet
  fs.writeFileSync(shortcutsConfigPath, JSON.stringify(shortcutsConfig, null, 2), 'utf8');
  
  // Kısayolları yeniden kaydet
  registerShortcuts();
  
  // Otomatik başlatma ayarını güncelle
  if (newConfig.hasOwnProperty('startOnBoot')) {
    setAutoLaunch(newConfig.startOnBoot);
  }
  
  // Maksimum pano öğe sayısını güncelle
  if (newConfig.hasOwnProperty('maxClipboardItems')) {
    maxClipboardItemCount = newConfig.maxClipboardItems;
    console.log(`Maksimum pano öğesi sayısı ${maxClipboardItemCount} olarak güncellendi`);
    
    // Mevcut öğeleri temizle ve limitlerken sabitlenmiş öğeleri koru
    if (clipboardItems.length > maxClipboardItemCount) {
      trimClipboardItems();
    }
  }
  
  // Tema ayarını güncelle
  if (newConfig.hasOwnProperty('theme')) {
    applyTheme(newConfig.theme);
  }
  
  // Yazı tipi boyutunu güncelle
  if (newConfig.hasOwnProperty('fontSize')) {
    applyFontSize(newConfig.fontSize);
  }
  
  // Bildirim ayarlarını güncelle
  if (newConfig.hasOwnProperty('showNotifications')) {
    showNotifications = newConfig.showNotifications;
  }
  
  if (newConfig.hasOwnProperty('notificationSound')) {
    notificationSound = newConfig.notificationSound;
  }
  
  if (newConfig.hasOwnProperty('notificationDuration')) {
    notificationDuration = newConfig.notificationDuration * 1000; // saniyeden milisaniyeye
  }
  
  // Tüm ayarları settings dosyasına da kaydet
  saveSettings();
  
  // Tüm pencerelere yeni yapılandırmayı bildir
  if (mainWindow) {
    mainWindow.webContents.send('shortcuts-updated', shortcutsConfig);
    
    // Transparan arka plan
    if (newConfig.hasOwnProperty('transparentBackground')) {
      setWindowTransparency(mainWindow, newConfig.transparentBackground);
    }
  }
  
  if (shortcutSettingsWindow) {
    shortcutSettingsWindow.webContents.send('shortcuts-updated', shortcutsConfig);
  }
  
  console.log('Kısayol tuşları ve ayarlar güncellendi:', shortcutsConfig);
}

// Otomatik başlatma ayarı
function setAutoLaunch(enable) {
  const { app } = require('electron');
  const AutoLaunch = require('auto-launch');
  
  const autoLauncher = new AutoLaunch({
    name: app.getName(),
    path: app.getPath('exe')
  });
  
  if (enable) {
    autoLauncher.enable()
      .then(() => console.log('Otomatik başlatma etkinleştirildi'))
      .catch(err => console.error('Otomatik başlatma etkinleştirilemedi:', err));
  } else {
    autoLauncher.disable()
      .then(() => console.log('Otomatik başlatma devre dışı bırakıldı'))
      .catch(err => console.error('Otomatik başlatma devre dışı bırakılamadı:', err));
  }
}

// Pano öğelerini maksimum sayıya kadar kırp
function trimClipboardItems() {
  if (clipboardItems.length <= maxClipboardItemCount) return;
  
  // Sabitlenmiş öğeleri her zaman koru
  const pinnedItems = clipboardItems.filter(item => item.pinned);
  const unpinnedItems = clipboardItems.filter(item => !item.pinned);
  
  // Sabitlenmemiş öğeler arasından en yenileri seç
  const newUnpinnedItems = unpinnedItems
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, Math.max(0, maxClipboardItemCount - pinnedItems.length));
  
  // Birleştir ve güncelle
  clipboardItems = [...pinnedItems, ...newUnpinnedItems];
  console.log(`Pano öğeleri kırpıldı. Toplam: ${clipboardItems.length}, Sabitli: ${pinnedItems.length}`);
  
  // Değişiklikleri kaydet
  saveClipboardItems();
}

// Tema uygulaması
function applyTheme(theme) {
  if (mainWindow) {
    mainWindow.webContents.send('apply-theme', theme);
    console.log(`${theme} teması uygulandı`);
  }
}

// Yazı tipi boyutu ayarı
function applyFontSize(fontSize) {
  if (mainWindow) {
    mainWindow.webContents.send('apply-font-size', fontSize);
    console.log(`${fontSize} yazı tipi boyutu uygulandı`);
  }
}

// Pencere şeffaflığını ayarla
function setWindowTransparency(window, isTransparent) {
  if (!window) return;
  
  if (isTransparent) {
    window.setBackgroundColor('#00000000');
    window.setOpacity(0.9);
  } else {
    window.setBackgroundColor('#ffffff');
    window.setOpacity(1.0);
  }
  
  console.log(`Pencere şeffaflığı: ${isTransparent ? 'Açık' : 'Kapalı'}`);
}

// Dil ayarları penceresi
let languageSettingsWindow = null;

function createLanguageSettingsWindow() {
  if (languageSettingsWindow) {
    languageSettingsWindow.focus();
    return;
  }
  
  languageSettingsWindow = new BrowserWindow({
    width: 400,
    height: 500,
    title: t('language.title'),
    parent: mainWindow,
    modal: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  languageSettingsWindow.loadFile(path.join(__dirname, 'html', 'language-settings.html'));
  languageSettingsWindow.removeMenu();
  
  languageSettingsWindow.on('closed', () => {
    languageSettingsWindow = null;
  });
}

// Ana ekranı güncelleme fonksiyonu
function updateAppMenu() {
  const mainMenu = Menu.buildFromTemplate(createMenuTemplate());
  Menu.setApplicationMenu(mainMenu);
  
  // Sistem tepsisi menüsünü güncelle
  if (tray) {
    const contextMenu = Menu.buildFromTemplate([
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
  const languages = i18n.getSupportedLanguages();
  const currentLanguage = i18n.getCurrentLanguage();
  
  // Dil ayarları için çevirileri gönder
  const translations = {
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
  if (i18n.changeLanguage(language)) {
    // Menüleri güncelle
    updateAppMenu();
    
    // Pencere görünürlük durumunu kaydet
    const isWindowVisible = mainWindow && mainWindow.isVisible();
    
    // Dil değişikliği için yeniden yükleme bayrağını ayarla
    isReloadingForLanguageChange = true;
    
    // Reload the main window with the correct HTML file based on language
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (language === 'en') {
        console.log('Switching to English version (index-en.html)');
        mainWindow.loadFile(path.join(__dirname, 'html', 'index-en.html'));
      } else {
        console.log('Switching to Turkish version (index.html)');
        mainWindow.loadFile(path.join(__dirname, 'html', 'index.html'));
        
        // For Turkish version, need to send translations after a short delay
        setTimeout(() => {
          console.log('Sending translations after language change');
          const translations = sendIndexTranslations();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('index-translations', translations);
          }
        }, 1000);
      }
      
      // Pencere içeriği yüklendikten sonra pencere görünürlüğünü geri yükle
      mainWindow.once('ready-to-show', () => {
        console.log('Dil değişikliği sonrası pencere hazır, görünürlük durumu: ' + isWindowVisible);
        
        if (isWindowVisible) {
          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.show();
              mainWindow.focus();
              console.log('Pencere tekrar gösteriliyor');
            }
          }, 300);
        }
        
        // Dil değişikliği bayrağını sıfırla
        isReloadingForLanguageChange = false;
      });
    }
    
    // Update any other windows (e.g., about window, settings window)
    BrowserWindow.getAllWindows().forEach(win => {
      if (win !== mainWindow) {
        console.log(`Pencereye dil değişikliği bildiriliyor: ${win.getTitle()}`);
        
        // About penceresi için özel işlem
        if (win === aboutWindow) {
          // Dile göre doğru HTML dosyasını yükle
          if (language === 'en') {
            win.loadFile(path.join(__dirname, 'html', 'about-en.html'));
          } else {
            win.loadFile(path.join(__dirname, 'html', 'about.html'));
          }
          
          // Sayfa yüklendiğinde çevirileri gönder
          win.webContents.once('did-finish-load', () => {
            const translations = sendAboutTranslations();
            win.webContents.send('about-translations', translations);
          });
        } else {
          // Diğer pencereler için sadece bildirim gönder
          win.webContents.send('language-changed', language);
        }
      }
    });
    
    console.log('Dil değişikliği tamamlandı');
  }
});

// Index sayfası için çevirileri hazırla ve gönder
function sendIndexTranslations(event) {
  const indexTranslations = {
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
    currentLanguage: i18n.getCurrentLanguage()
  };
  
  if (event) {
    console.log(`Çeviriler istemciye gönderiliyor, dil: ${indexTranslations.currentLanguage}`);
    console.log('Örnek çeviri değerleri:', {
      title: indexTranslations.app.title,
      description: indexTranslations.app.description,
      statusBadge: indexTranslations.ui.statusBadge
    });
    
    event.sender.send('index-translations', indexTranslations);
  }
  return indexTranslations;
}

// About penceresi için çevirileri hazırla ve gönder
function sendAboutTranslations(event) {
  const aboutTranslations = {
    app: {
      title: t('app.title'),
      description: t('app.description')
    },
    about: {
      title: t('about.title'),
      version: t('about.version'),
      developer: t('about.developer'),
      aboutSectionTitle: t('about.aboutSectionTitle'),
      description1: t('about.description1'),
      description2: t('about.description2'),
      closeButton: t('about.closeButton'),
      copyright: t('about.copyright'),
      license: t('about.license')
    },
    currentLanguage: i18n.getCurrentLanguage()
  };
  
  console.log(`About çevirileri istemciye gönderiliyor, dil: ${aboutTranslations.currentLanguage}`);
  console.log('About çevirileri:', aboutTranslations);
  
  if (event) {
    event.sender.send('about-translations', aboutTranslations);
  }
  
  return aboutTranslations;
}

// About penceresi
let aboutWindow = null;

function createAboutWindow() {
  if (aboutWindow) {
    aboutWindow.focus();
    return;
  }
  
  aboutWindow = new BrowserWindow({
    width: 400,
    height: 650,
    title: t('about.title'),
    parent: mainWindow,
    modal: true,
    resizable: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  // Dil seçimine göre doğru HTML sayfasını yükle
  const currentLanguage = i18n.getCurrentLanguage();
  if (currentLanguage === 'en') {
    aboutWindow.loadFile(path.join(__dirname, 'html', 'about-en.html'));
  } else {
    aboutWindow.loadFile(path.join(__dirname, 'html', 'about.html'));
  }
  
  aboutWindow.removeMenu();
  
  // About penceresi hazır olduğunda çevirileri gönder
  aboutWindow.webContents.once('did-finish-load', () => {
    // Çevirileri gönder
    const translations = sendAboutTranslations();
    aboutWindow.webContents.send('about-translations', translations);
  });
  
  aboutWindow.on('closed', () => {
    aboutWindow = null;
  });
}

// IPC olay dinleyicileri
function setupIpcHandlers() {
  // Mevcut IPC işleyicileri
  
  // Index ve About sayfaları için çeviri işleyicileri
  ipcMain.on('get-index-translations', (event) => {
    console.log('get-index-translations isteği alındı');
    sendIndexTranslations(event);
  });
  
  ipcMain.on('get-about-translations', (event) => {
    console.log('get-about-translations isteği alındı');
    sendAboutTranslations(event);
  });
  
  // Shortcut settings sayfası için çeviri işleyicisi
  ipcMain.on('get-shortcuts-translations', (event) => {
    console.log('get-shortcuts-translations isteği alındı');
    
    // Kısayol ayarları için çevirileri gönder
    const shortcutsTranslations = {
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
  
  // Pinnedpositions için talep
  ipcMain.on('get-pinned-positions', (event) => {
    console.log('Renderer pinnedPositions talep etti, gönderiliyor:', pinnedPositions);
    event.sender.send('pinned-positions', pinnedPositions);
  });
}

// Ana pencere ve uygulama yeniden yükleme
function reloadAppForLanguageChange() {
  if (!mainWindow) return;
  
  isReloadingForLanguageChange = true;
  
  const currentLanguage = i18n.getCurrentLanguage();
  console.log(`Reloading for language change: ${currentLanguage}`);
  
  // Ana pencere için uygun HTML dosyasını yükle
  if (currentLanguage === 'en') {
    mainWindow.loadFile(path.join(__dirname, 'html', 'index-en.html'));
  } else {
    mainWindow.loadFile(path.join(__dirname, 'html', 'index.html'));
  }
  
  // Menüyü güncelle
  updateAppMenu();
  
  isReloadingForLanguageChange = false;
}

// Ayarları kaydet
function saveSettings() {
  try {
    const settings = {
      maxClipboardItems: maxClipboardItemCount,
      showNotifications: showNotifications,
      notificationSound: notificationSound,
      notificationDuration: notificationDuration / 1000, // milisaniyeden saniyeye
      startOnBoot: shortcutsConfig.startOnBoot || false,
      minimizeToTray: shortcutsConfig.minimizeToTray || true,
      theme: shortcutsConfig.theme || 'system',
      transparentBackground: shortcutsConfig.transparentBackground || false,
      fontSize: shortcutsConfig.fontSize || 'medium'
    };
    
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    console.log('Ayarlar kaydedildi:', settings);
  } catch (error) {
    console.error('Ayarları kaydetme hatası:', error);
  }
}

// Tüm pencerelere mesaj gönderen yardımcı fonksiyon
function sendToAllWindows(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

// Kısayolları güncelleyen fonksiyon
function updateGlobalShortcuts() {
  // Mevcut kısayolları temizle ve yeniden kaydet
  console.log('Global kısayollar güncelleniyor...');
  registerShortcuts();
}