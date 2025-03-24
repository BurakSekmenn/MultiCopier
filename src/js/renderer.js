// Get required elements from the Electron API
const { ipcRenderer, clipboard } = require('electron');

// UI elements
let clipboardListElement;
let emptyStateElement;
let addButton;
let clearButton;

// Şu anda kaç pozisyon kullanılabilir
const PIN_LIMIT = 9;

// Keep a local copy of clipboard items
let clipboardItems = [];

// Pinned positions storage
let pinnedPositions = {};
// Global pinned positions değişkeni ekleyelim
let globalPinnedPositions = {};

// Debug için pano öğeleri sayacı
let clipboardUpdateCounter = 0;

// DOM hazır olduğunda UI elemanlarını tanımla
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM hazır, UI elemanları tanımlanıyor...');
  
  // UI elemanlarını tanımla
  clipboardListElement = document.getElementById('clipboard-list');
  emptyStateElement = document.getElementById('empty-state');
  addButton = document.getElementById('add-btn');
  clearButton = document.getElementById('clear-btn');
  
  if (!clipboardListElement) {
    console.error('Hata: #clipboard-list elementi bulunamadı!');
    return;
  }
  
  // Gerekli konteynerın varlığını kontrol et
  const container = document.getElementById('clipboard-items-container');
  if (!container) {
    console.error('Hata: #clipboard-items-container elementi bulunamadı!');
    // Oluşturalım
    const itemsContainer = document.createElement('div');
    itemsContainer.id = 'clipboard-items-container';
    itemsContainer.className = 'clipboard-items-container';
    
    // clipboardListElement'in ilk çocuğu olarak ekle
    if (clipboardListElement.firstChild) {
      clipboardListElement.insertBefore(itemsContainer, clipboardListElement.firstChild);
    } else {
      clipboardListElement.appendChild(itemsContainer);
    }
    
    console.log('clipboard-items-container elementi oluşturuldu');
  }
  
  // Event listeners
  if (addButton) {
    addButton.addEventListener('click', addClipboardItem);
  }
  
  if (clearButton) {
    clearButton.addEventListener('click', clearClipboardItems);
  }
  
  // İlk yüklemede sabitlenmiş pozisyonları al
  ipcRenderer.send('get-pinned-positions');
  
  // Arabirim hazır olduğunda, gecikmeli olarak öğeleri yükle
  setTimeout(() => {
    console.log('Başlangıç kopyalama öğeleri talep ediliyor...');
    ipcRenderer.send('get-clipboard-items');
  }, 100);
  
  // Ek bir kontrol daha yap, her şeyin doğru yüklendiğinden emin ol
  setTimeout(() => {
    if (window.clipboardItems && window.clipboardItems.length > 0) {
      const container = document.getElementById('clipboard-items-container');
      if (container && container.children.length === 0) {
        console.log('Veriler var ama görüntülenemedi, yeniden render deneniyor...');
        renderClipboardItems();
      }
    }
  }, 1000);
});

// Sayfa tam olarak yüklendiğinde son bir kontrol yapalım
window.addEventListener('load', () => {
  console.log('Sayfa tamamen yüklendi, son kontroller yapılıyor...');
  
  // Gerekli konteynerların var olduğunu doğrula ve yoksa oluştur
  const listElement = document.getElementById('clipboard-list');
  if (!listElement) {
    console.error('Kritik hata: load eventi sonrası clipboard-list bulunamadı!');
    const container = document.querySelector('.container');
    if (container) {
      // Liste elementi oluştur
      const newListElement = document.createElement('div');
      newListElement.id = 'clipboard-list';
      newListElement.className = 'clipboard-list';
      container.appendChild(newListElement);
      console.log('clipboard-list elementi oluşturuldu');
      
      // İçine container oluştur
      const itemsContainer = document.createElement('div');
      itemsContainer.id = 'clipboard-items-container';
      itemsContainer.className = 'clipboard-items-container';
      newListElement.appendChild(itemsContainer);
      console.log('clipboard-items-container elementi oluşturuldu');
    }
  } else {
    // Liste var, içerisinde items-container var mı?
    const itemsContainer = document.getElementById('clipboard-items-container');
    if (!itemsContainer) {
      console.warn('load eventi sonrası clipboard-items-container bulunamadı, oluşturuluyor');
      const newContainer = document.createElement('div');
      newContainer.id = 'clipboard-items-container';
      newContainer.className = 'clipboard-items-container';
      listElement.insertBefore(newContainer, listElement.firstChild);
      console.log('clipboard-items-container elementi oluşturuldu');
    }
  }
  
  // Verileri tekrar talep et ve render yap
  ipcRenderer.send('get-pinned-positions');
  setTimeout(() => {
    ipcRenderer.send('get-clipboard-items');
  }, 100);
});

// Debounce function for rendering
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      func.apply(context, args);
    }, wait);
  };
}

// Add a clipboard item
function addClipboardItem() {
  const text = clipboard.readText();
  if (!text) {
    alert('Panoda kopyalanmış metin bulunamadı.');
    return;
  }
  
  ipcRenderer.send('add-clipboard-item', text);
}

// Remove a clipboard item
function removeClipboardItem(id) {
  ipcRenderer.send('remove-clipboard-item', id);
}

// Clear all clipboard items
function clearClipboardItems() {
  if (confirm('Tüm kopyalanmış öğeleri silmek istediğinize emin misiniz?')) {
    ipcRenderer.send('clear-clipboard-items');
  }
}

// Pin an item to a position
function pinItem(id, position) {
  console.log(`UI'dan sabitleme isteği gönderiliyor: ID ${id}, Pozisyon ${position}`);
  
  // ID ve pozisyonu sayıya dönüştürelim
  id = Number(id);
  position = Number(position);
  
  // İlgili öğeyi bul
  const itemToPin = clipboardItems.find(item => Number(item.id) === id);
  if (itemToPin) {
    console.log(`Sabitlenecek öğe bulundu: "${itemToPin.text.substring(0, 20)}..."`);
    // Öğeyi sabitlenmiş olarak işaretle
    itemToPin.pinned = true;
  } else {
    console.error(`Hata: ID ${id} olan öğe bulunamadı!`);
  }
  
  // Mevcut globalPinnedPositions'ı güncelle
  globalPinnedPositions[position] = id;
  console.log(`UI tarafından globalPinnedPositions güncellendi: Pozisyon ${position} => ID ${id}`);
  console.log(`Güncellenmiş globalPinnedPositions:`, JSON.stringify(globalPinnedPositions));
  
  // Ana sürece sabitleme isteği gönder
  ipcRenderer.send('pin-item', { id, position });
}

// Unpin an item
function unpinItem(id) {
  console.log(`Sabitleme kaldırma isteği gönderiliyor: ID ${id}`);
  id = Number(id);
  
  // Öğeyi bul
  const itemToUnpin = clipboardItems.find(item => Number(item.id) === id);
  if (itemToUnpin) {
    // Öğenin sabitlemesini kaldır
    itemToUnpin.pinned = false;
    console.log(`ID ${id} olan öğenin pinned=false yapıldı: "${itemToUnpin.text.substring(0, 20)}..."`);
  }
  
  // globalPinnedPositions içinden bu ID'yi temizle
  let positionRemoved = null;
  for (const pos in globalPinnedPositions) {
    if (Number(globalPinnedPositions[pos]) === id) {
      positionRemoved = pos;
      delete globalPinnedPositions[pos];
      console.log(`globalPinnedPositions'dan pozisyon ${pos} kaldırıldı`);
    }
  }
  
  console.log(`Güncellenmiş globalPinnedPositions:`, JSON.stringify(globalPinnedPositions));
  
  // Ana sürece sabitleme kaldırma isteği gönder
  ipcRenderer.send('unpin-item', id);
}

// Format date for display
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

// Show copy notification
function showCopyNotification(index) {
  // Find the element with the corresponding index
  const itemElements = document.querySelectorAll('.clipboard-item');
  if (itemElements.length > index - 1) {
    const itemElement = itemElements[index - 1];
    
    // Create and add notification element
    const notification = document.createElement('div');
    notification.className = 'notification copy-notification';
    notification.textContent = 'Panoya kopyalandı! (Ctrl+V ile yapıştırabilirsiniz)';
    
    // Get position of the item element
    const rect = itemElement.getBoundingClientRect();
    notification.style.top = `${rect.top + window.scrollY}px`;
    notification.style.left = `${rect.left + rect.width / 2}px`;
    notification.style.transform = 'translate(-50%, 0) translateZ(0)';
    
    // Add to body
    document.body.appendChild(notification);
    
    // Highlight the item
    const originalBg = itemElement.style.backgroundColor;
    itemElement.style.backgroundColor = 'rgba(39, 174, 96, 0.2)';
    
    // Remove notification after 2 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 300);
      
      // Remove highlight
      setTimeout(() => {
        if (document.contains(itemElement)) {
          itemElement.style.backgroundColor = originalBg;
        }
      }, 500);
    }, 2000);
  }
}

// Pin notification UI
function showPinNotification(position, text) {
  console.log(`Pin bildirimi gösteriliyor: Pozisyon ${position}, Text=${typeof text === 'string' ? text.substring(0, 20) : 'Bulunamadı'}`);
  
  // Notification container varsa kaldır
  const existingNotification = document.querySelector('.pin-notification');
  if (existingNotification) {
    document.body.removeChild(existingNotification);
  }
  
  // Create notification element
  const notification = document.createElement('div');
  notification.className = 'notification pin-notification';
  
  // Geçerli bir text var mı kontrol et
  if (typeof text !== 'string' || !text) {
    console.error('Sabitleme bildirimi için geçerli metin bulunamadı!');
    text = 'Metin bulunamadı';
  }
  
  // Metni kısalt
  const maxLength = 20;
  const shortText = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  
  // Display the notification text
  notification.textContent = `"${shortText}" metni tam olarak pozisyon ${position}'e sabitlendi.`;
  
  // Add to body
  document.body.appendChild(notification);
  
  // Remove notification after 3 seconds
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 300);
  }, 3000);
  
  // Log sabitleme bilgisi
  console.log(`Bildirim gösterildi: "${shortText}" metni tam olarak pozisyon ${position}'e sabitlendi`);
  
  // Update UI to show the item is pinned
  renderClipboardItems();
}

// Create HTML for a clipboard item
function createClipboardItemElement(item, index) {
  try {
    // Geçersiz öğe kontrolü
    if (!item || typeof item !== 'object') {
      console.error(`Geçersiz öğe tipi: ${typeof item}, index: ${index}`);
      return document.createElement('div'); // Boş bir div döndür
    }
    
    const itemElement = document.createElement('div');
    itemElement.className = 'clipboard-item';
    
    // ID sabitliği için kontrol yapalım (ID zorunlu alan)
    if (!item.id) {
      console.warn(`ID olmayan öğe, geçici ID atanıyor: ${index}`);
      item.id = Date.now() + index;
    }
    
    itemElement.dataset.id = item.id;
    
    // Ensure pinned status is reflected in the UI
    if (item.pinned === true) {
      itemElement.classList.add('pinned');
      console.log(`Öğe ID=${item.id} sabitlenmiş olarak işaretlendi`);
    }
    
    // Metin içeriğini görüntü için hazırla
    let displayText = '';
    
    if (item.text !== undefined && item.text !== null) {
      displayText = String(item.text); // Sayılar için string'e dönüştür
    } else {
      displayText = '(Boş metin)';
      console.warn(`ID=${item.id} olan öğenin metni yok`);
    }
    
    // Content container
    const contentDiv = document.createElement('div');
    contentDiv.className = 'clipboard-content';
    
    // Sabitli öğeler için rozet ekle
    let shortcutPosition = null;
    
    // Eğer bu öğe sabitlenmişse
    if (item.pinned) {
      console.log(`Sabitlenmiş öğe için rozet oluşturuluyor: ID=${item.id}, Mevcut globalPinnedPositions:`, JSON.stringify(globalPinnedPositions));
      
      // Bu öğenin ID'sinin sabitlendiği pozisyonu bul
      for (const pos in globalPinnedPositions) {
        const posId = Number(globalPinnedPositions[pos]);
        const itemId = Number(item.id);
        
        console.log(`Pozisyon ${pos} kontrolü: globalPinnedPositions[${pos}]=${posId}, item.id=${itemId}, Eşleşme: ${posId === itemId}`);
        
        if (posId === itemId) {
          shortcutPosition = pos;
          console.log(`Eşleşme bulundu! Öğe ID=${item.id} için shortcutPosition=${pos} olarak ayarlandı`);
          break;
        }
      }
      
      // Eğer bu öğenin pozisyonu bulunamadıysa, yeniden veri almayı dene
      if (!shortcutPosition) {
        console.warn(`Sabitlenmiş öğe ID=${item.id} için pozisyon bulunamadı! Ana süreçten yeniden veri alınıyor.`);
        // Ana süreçten pozisyonları yeniden almak için async istek gönder
        setTimeout(() => {
          ipcRenderer.send('get-pinned-positions');
        }, 100);
      } else {
        // Pozisyon bulundu, rozeti ekle
        console.log(`Sabitlenmiş öğe için Ctrl+${shortcutPosition} rozeti ekleniyor`);
        const shortcutBadge = document.createElement('div');
        shortcutBadge.className = 'shortcut-badge pinned';
        shortcutBadge.textContent = `Ctrl+${shortcutPosition}`;
        shortcutBadge.title = `Bu öğe Ctrl+${shortcutPosition} kısayoluna sabitlenmiştir.`;
        contentDiv.appendChild(shortcutBadge);
      }
    } else {
      // Normal kısayollar: Sabitsiz öğeler için ilk 9 sıraya kısayol atanır
      // Ancak bu kez sabitlenmiş pozisyonları atlamalıyız
      
      // Kaç tane sabitsiz öğe geçtik?
      let nonPinnedIndex = 0;
      
      // Tüm öğelerin listesinde bu öğeye kadar kaç tane sabitsiz öğe var say
      const allItems = clipboardItems.filter(i => !i.pinned);
      for (let i = 0; i < allItems.length; i++) {
        // Eğer bu bizim şu anki öğemizse, döngüyü sonlandır
        if (Number(allItems[i].id) === Number(item.id)) {
          break;
        }
        nonPinnedIndex++;
      }
      
      // Eğer bu öğe ilk 9 sabitsiz öğe içindeyse kısayol ekle
      if (nonPinnedIndex < 9) {
        // Bir sonraki boş pozisyonu bul (1'den başla, sabitlenmiş pozisyonları atla)
        let availablePosition = 1;
        let usedPositions = {};
        
        // Kullanılmış pozisyonları belirle
        for (const pos in globalPinnedPositions) {
          usedPositions[pos] = true;
        }
        
        // Doğru pozisyonu bul
        let currentPositionIndex = 0;
        while (availablePosition <= 9 && currentPositionIndex <= nonPinnedIndex) {
          if (!usedPositions[availablePosition]) {
            if (currentPositionIndex === nonPinnedIndex) {
              break;
            }
            currentPositionIndex++;
          }
          availablePosition++;
        }
        
        // Eğer 1-9 arasında uygun bir pozisyon bulunduysa rozet ekle
        if (availablePosition <= 9 && !usedPositions[availablePosition]) {
          const shortcutBadge = document.createElement('div');
          shortcutBadge.className = 'shortcut-badge';
          shortcutBadge.textContent = `Ctrl+${availablePosition}`;
          shortcutBadge.title = `Bu öğeyi yapıştırmak için Ctrl+${availablePosition} kısayolunu kullanın.`;
          contentDiv.appendChild(shortcutBadge);
        }
      }
    }
    
    // Text element
    const textDiv = document.createElement('div');
    textDiv.className = 'clipboard-text';
    
    // Metni kısalt (20 karakterden fazlası için)
    const maxLength = 30;
    let displayShortText = '';
    
    // Eğer displayText boş veya undefined ise, özel bir mesaj göster
    if (!displayText || displayText === '...') {
      console.warn(`ID=${item.id} olan öğenin metni sorunlu: "${displayText}"`);
      displayShortText = item.text && item.text.length > 0 
        ? (item.text.length > maxLength ? item.text.substring(0, maxLength) + '...' : item.text) 
        : '(Boş metin)';
    } else {
      displayShortText = displayText.length > maxLength 
        ? displayText.substring(0, maxLength) + '...'
        : displayText;
    }
    
    // Kısaltılmış metni göster
    textDiv.textContent = displayShortText;
    
    // Debug için log
    console.log(`Öğe ID=${item.id}, Metin: "${displayShortText}"`);
    
    // Tam metni tooltip olarak ekle
    if (displayText && displayText.length > maxLength) {
      textDiv.title = displayText;
    }
    
    contentDiv.appendChild(textDiv);
    
    // Append content to item
    itemElement.appendChild(contentDiv);
    
    // Actions container
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'clipboard-actions';
    
    // Timestamp
    if (item.date) {
      const timestampDiv = document.createElement('div');
      timestampDiv.className = 'timestamp';
      timestampDiv.textContent = formatDate(item.date);
      actionsDiv.appendChild(timestampDiv);
    }
    
    // Pin/Unpin button
    const pinButton = document.createElement('button');
    if (item.pinned) {
      pinButton.className = 'unpin-btn';
      pinButton.textContent = 'Sabiti Kaldır';
      pinButton.onclick = (e) => {
        e.stopPropagation();
        unpinItem(item.id);
      };
    } else {
      pinButton.className = 'pin-btn';
      pinButton.textContent = 'Sabitle';
      pinButton.onclick = (e) => {
        e.stopPropagation();
        // Pozisyon seçme arayüzü göster
        showPinPositionSelector(item.id, e);
      };
    }
    
    // Delete button
    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-btn';
    deleteButton.textContent = 'Sil';
    deleteButton.onclick = () => {
      removeClipboardItem(item.id);
    };
    
    // Append actions to item
    actionsDiv.appendChild(pinButton);
    actionsDiv.appendChild(deleteButton);
    
    // Append actions to item
    itemElement.appendChild(actionsDiv);
    
    return itemElement;
  } catch (error) {
    console.error(`Öğe oluşturmada kritik hata: ${error.message}`, error);
    // Boş bir div döndür, uygulamanın çökmesini engelle
    return document.createElement('div');
  }
}

// Sabitleme pozisyonu seçicisini göster  
function showPinPositionSelector(itemId, event) {
  console.log(`Pozisyon seçici gösteriliyor: Öğe ID ${itemId}`);
  
  // Mevcut seçici varsa kaldır
  const existingSelector = document.getElementById('pin-position-selector');
  if (existingSelector) {
    document.body.removeChild(existingSelector);
  }
  
  // Seçici oluştur
  const selector = document.createElement('div');
  selector.id = 'pin-position-selector';
  selector.className = 'pin-position-selector';
  
  // Başlık
  const title = document.createElement('div');
  title.className = 'selector-title';
  title.textContent = 'Pozisyon Seçin (1-9)';
  selector.appendChild(title);
  
  // Butonlar konteynerı
  const buttonsContainer = document.createElement('div');
  buttonsContainer.className = 'position-buttons';
  
  // Sabitlenmiş pozisyonları kontrol et ve etiketleri güncelle
  const usedPositions = {};
  for (const pos in globalPinnedPositions) {
    if (globalPinnedPositions[pos]) {
      // Eğer bu ID'nin kendisi değilse işaretle
      if (globalPinnedPositions[pos] !== itemId) {
        usedPositions[pos] = true;
      }
    }
  }
  
  // Tüm olası pozisyonlar için butonlar oluştur (1-9)
  for (let i = 1; i <= 9; i++) {
    const button = document.createElement('button');
    button.className = 'position-button';
    button.textContent = i;
    
    // Eğer pozisyon kullanımdaysa devre dışı bırak
    if (usedPositions[i]) {
      button.disabled = true;
      
      // Kullanılan öğenin bilgisini tooltip'de göster
      const usedItemId = globalPinnedPositions[i];
      const usedItem = clipboardItems.find(item => Number(item.id) === Number(usedItemId));
      
      if (usedItem && usedItem.text) {
        // Metni kısaltma
        const maxLength = 20;
        const shortText = usedItem.text.length > maxLength 
          ? usedItem.text.substring(0, maxLength) + '...' 
          : usedItem.text;
          
        button.title = `Bu pozisyon kullanımda: "${shortText}"`;
      } else {
        button.title = 'Bu pozisyon kullanımda';
      }
      
      button.classList.add('disabled');
    } else {
      button.onclick = () => {
        pinItem(itemId, i);
        document.body.removeChild(selector);
      };
    }
    
    buttonsContainer.appendChild(button);
  }
  
  selector.appendChild(buttonsContainer);
  
  // İptal butonu
  const cancelButton = document.createElement('button');
  cancelButton.className = 'cancel-button';
  cancelButton.textContent = 'İptal';
  cancelButton.onclick = () => {
    document.body.removeChild(selector);
  };
  selector.appendChild(cancelButton);
  
  // Konumu ayarla (tıklanan butonun yanında)
  if (event) {
    const rect = event.target.getBoundingClientRect();
    selector.style.top = `${rect.bottom + 5}px`;
    selector.style.left = `${rect.left}px`;
  } else {
    // Varsayılan pozisyon
    selector.style.top = '50%';
    selector.style.left = '50%';
    selector.style.transform = 'translate(-50%, -50%)';
  }
  
  // Ekrana ekle
  document.body.appendChild(selector);
  
  // Dışarı tıklandığında kapat
  document.addEventListener('click', function closeSelector(e) {
    if (!selector.contains(e.target) && e.target !== event.target) {
      if (document.body.contains(selector)) {
        document.body.removeChild(selector);
      }
      document.removeEventListener('click', closeSelector);
    }
  });
}

// Pano öğelerini render et
function renderClipboardItems() {
  console.log('Pano öğeleri render ediliyor... globalPinnedPositions:', JSON.stringify(globalPinnedPositions));
  
  // Container elementini bul
  const container = document.getElementById('clipboard-items-container');
  if (!container) {
    console.error('clipboard-items-container elementi bulunamadı!');
    return;
  }
  
  // Önce konteyner içeriğini temizle
  container.innerHTML = '';
  
  // Sonsuz döngü engelleme
  if (window.isRenderingItems) {
    console.log('Zaten render işlemi devam ediyor, atlıyoruz');
    return;
  }
  
  window.isRenderingItems = true;
  
  // Öğeler boş veya geçersiz mi?
  if (!clipboardItems || !Array.isArray(clipboardItems) || clipboardItems.length === 0) {
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'empty-clipboard-message';
    emptyMessage.textContent = 'Pano boş';
    container.appendChild(emptyMessage);
    window.isRenderingItems = false;
    return;
  }
  
  try {
    // En son sabitlenmiş öğeleri en üste koyacağız, sonra normal öğeler gelecek
    const pinnedItems = clipboardItems.filter(item => item.pinned);
    const normalItems = clipboardItems.filter(item => !item.pinned);
    
    // Kaç öğe render edildiğinin detaylarını logla
    console.log(`Toplam ${clipboardItems.length} öğe var: ${pinnedItems.length} sabitli, ${normalItems.length} normal`);
    
    // Önce sabitlenmiş öğeleri ekle
    if (pinnedItems.length > 0) {
      const pinnedSection = document.createElement('div');
      pinnedSection.className = 'items-section pinned-section';
      
      const pinnedHeader = document.createElement('div');
      pinnedHeader.className = 'section-header';
      pinnedHeader.textContent = 'Sabitlenmiş Öğeler';
      pinnedSection.appendChild(pinnedHeader);
      
      // Sabitli öğeleri pozisyon sırasına göre sırala
      const sortedPinnedItems = [...pinnedItems].sort((a, b) => {
        // Her öğenin pozisyonunu bul
        let posA = null;
        let posB = null;
        
        for (const pos in globalPinnedPositions) {
          if (Number(globalPinnedPositions[pos]) === Number(a.id)) posA = Number(pos);
          if (Number(globalPinnedPositions[pos]) === Number(b.id)) posB = Number(pos);
        }
        
        // Pozisyonu olmayanlar en sona
        if (posA === null) return 1;
        if (posB === null) return -1;
        
        // Pozisyon sırasına göre sırala
        return posA - posB;
      });
      
      // Debuging için her sabitli öğenin ID'sini ve pozisyonunu logla
      sortedPinnedItems.forEach(item => {
        let position = null;
        for (const pos in globalPinnedPositions) {
          if (Number(globalPinnedPositions[pos]) === Number(item.id)) {
            position = pos;
            break;
          }
        }
        console.log(`Sabitli öğe: ID=${item.id}, Pozisyon=${position}, Metin="${item.text.substring(0, 20)}..."`);
      });
      
      // Sabitli öğeleri ekle
      sortedPinnedItems.forEach((item, index) => {
        const itemElement = createClipboardItemElement(item, index);
        pinnedSection.appendChild(itemElement);
      });
      
      container.appendChild(pinnedSection);
    }
    
    // Sonra normal öğeleri ekle (son eklenenler en üstte)
    if (normalItems.length > 0) {
      const normalSection = document.createElement('div');
      normalSection.className = 'items-section normal-section';
      
      const normalHeader = document.createElement('div');
      normalHeader.className = 'section-header';
      normalHeader.textContent = 'Son Kopyalananlar';
      normalSection.appendChild(normalHeader);
      
      // Normal öğeleri tarih sırasına göre (en yeni en üstte)
      const sortedNormalItems = [...normalItems].sort((a, b) => {
        return new Date(b.date) - new Date(a.date);
      });
      
      // Normal öğeleri ekle
      sortedNormalItems.forEach((item, index) => {
        const itemElement = createClipboardItemElement(item, index);
        normalSection.appendChild(itemElement);
      });
      
      container.appendChild(normalSection);
    }
  } catch (error) {
    console.error('Render sırasında hata:', error);
    
    // Hata durumunda basit bir mesaj göster
    const errorMessage = document.createElement('div');
    errorMessage.className = 'error-message';
    errorMessage.textContent = 'Öğeler görüntülenirken bir hata oluştu.';
    container.appendChild(errorMessage);
  } finally {
    // İşaretlemeyi kaldır
    window.isRenderingItems = false;
  }
}

// Debounced version of renderClipboardItems
const debouncedRenderClipboardItems = debounce(renderClipboardItems, 50);

// Listen for clipboard updates from main process
ipcRenderer.on('clipboard-updated', (event, items) => {
  console.log("Pano güncellemesi alındı, öğe sayısı:", items.length);
  
  if (items.some(item => item.pinned)) {
    console.log("Sabitlenmiş öğeler var:", 
      items.filter(i => i.pinned)
        .map(i => ({ id: i.id, text: i.text.substring(0, 20) }))
    );
  }
  
  // Pano öğelerini güncelle
  clipboardItems = items;
  
  // Kontrol ekleyelim
  if (!Array.isArray(clipboardItems) || clipboardItems.length === 0) {
    console.warn("Alınan pano öğeleri boş veya dizi değil:", clipboardItems);
  }
  
  // UI'ı güncelle
  debouncedRenderClipboardItems();
});

// Listen for copy to clipboard notifications
ipcRenderer.on('item-copied-to-clipboard', (event, index) => {
  showCopyNotification(index);
});

// Listen for paste notifications
ipcRenderer.on('item-pasted', (event, index) => {
  showPasteNotification(index);
});

// Listen for item pinned notifications
ipcRenderer.on('item-pinned', (event, data) => {
  console.log('Sabitleme bilgisi alındı:', data);
  
  const { position, id, pinnedPositions } = data;
  
  // Eğer pinnedPositions verilmişse globalPinnedPositions'ı güncelle
  if (pinnedPositions) {
    console.log('Gelen pinnedPositions ile globalPinnedPositions güncelleniyor:', pinnedPositions);
    
    // Derinlemesine inceleyip log yazalım
    for (const pos in pinnedPositions) {
      console.log(`Pozisyon ${pos} => ID ${pinnedPositions[pos]}`);
    }
    
    // Global değişkeni güncelle
    globalPinnedPositions = {...pinnedPositions};
  } else {
    console.error('item-pinned mesajında pinnedPositions verisi bulunamadı!');
  }
  
  // ID'yi her durumda kontrol et
  if (id) {
    // Sabitlenmiş öğeyi bul
    const item = clipboardItems.find(item => Number(item.id) === Number(id));
    if (item) {
      // Öğeyi sabitlenmiş olarak işaretle
      item.pinned = true;
      
      // Sabitlendi mesajını göster
      console.log(`ID=${id} olan öğe pinned=true olarak işaretlendi`);
      
      // UI'a bildirim göster
      if (item.text) {
        showPinNotification(position, item.text);
      } else {
        console.error(`Hata: ID ${id} olan öğenin geçerli metni yok`);
      }
    } else {
      console.error(`Hata: ID ${id} olan öğe bulunamadı!`);
    }
  }
  
  // En güncel pano öğeleriyle UI'ı güncelle
  renderClipboardItems();
});

// Request initial clipboard items
ipcRenderer.on('clipboard-items', (event, items) => {
  console.log("Ana süreçten pano öğeleri alındı, öğe sayısı:", items ? items.length : 0);
  
  if (!items || !Array.isArray(items)) {
    console.error("Hata: Alınan öğeler geçersiz:", items);
    clipboardItems = [];
  } else {
    clipboardItems = items;
    
    // Sabitlenmiş öğe bilgilerini loglayalım
    const pinnedCount = items.filter(i => i.pinned).length;
    console.log(`Toplam ${items.length} öğe, ${pinnedCount} tanesi sabitlenmiş`);
    
    if (pinnedCount > 0) {
      console.log("Sabitlenmiş öğeler:", 
        items.filter(i => i.pinned)
          .map(i => ({ id: i.id, text: i.text.substring(0, 20) }))
      );
    }
    
    // Ana süreçten gelen pinnedPositions'ı kontrol et ve güncelle
    ipcRenderer.send('get-pinned-positions');
  }
});

// Listen for pinned positions from main process
ipcRenderer.on('pinned-positions', (event, positions) => {
  console.log("Ana süreçten sabitlenmiş pozisyonlar alındı:", positions);
  
  if (!positions || typeof positions !== 'object') {
    console.error("Hata: Alınan pozisyonlar geçersiz:", positions);
    pinnedPositions = {};
    globalPinnedPositions = {};
  } else {
    // Local ve global değişkeni güncelle
    pinnedPositions = positions;
    globalPinnedPositions = {...positions};
    
    // Sabitlenmiş pozisyonları loglayalım
    for (const pos in positions) {
      const itemId = positions[pos];
      const item = clipboardItems.find(item => Number(item.id) === Number(itemId));
      console.log(`Pozisyon ${pos} => ID ${itemId}, Metin: "${item ? item.text.substring(0, 20) : 'Bulunamadı'}"`);
    }
  }
  
  // UI'ı güncelle
  renderClipboardItems();
});

// Event listeners
addButton.addEventListener('click', addClipboardItem);
clearButton.addEventListener('click', clearClipboardItems);

// Add drag and drop sort functionality
function enableDragSort() {
  let draggedItem = null;
  
  // Add event listeners for drag and drop
  clipboardListElement.addEventListener('dragstart', (e) => {
    if (e.target.classList.contains('clipboard-item')) {
      draggedItem = e.target;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/html', draggedItem.outerHTML);
      draggedItem.classList.add('dragging');
    }
  });
  
  clipboardListElement.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.target.closest('.clipboard-item');
    
    if (target && target !== draggedItem) {
      const targetRect = target.getBoundingClientRect();
      const targetY = targetRect.top + (targetRect.height / 2);
      
      if (e.clientY < targetY) {
        target.parentNode.insertBefore(draggedItem, target);
      } else {
        target.parentNode.insertBefore(draggedItem, target.nextSibling);
      }
    }
  });
  
  clipboardListElement.addEventListener('dragend', () => {
    draggedItem.classList.remove('dragging');
    draggedItem = null;
    
    // Update the clipboardItems array based on the new order
    // We're careful to preserve all existing properties, especially 'pinned'
    const newOrder = [];
    document.querySelectorAll('.clipboard-item').forEach((item) => {
      const id = parseInt(item.dataset.id);
      const existingItem = clipboardItems.find(i => i.id === id);
      if (existingItem) {
        // Ensure we keep the exact same object with all its properties
        newOrder.push({...existingItem});
      }
    });
    
    // Check if we got all items
    if (newOrder.length === clipboardItems.length) {
      // Update the array and save to main process
      clipboardItems = newOrder;
      ipcRenderer.send('update-clipboard-items', clipboardItems);
    } else {
      // Something went wrong, refresh from the current state
      ipcRenderer.send('get-clipboard-items');
    }
  });
  
  // Make items draggable
  function updateDraggableItems() {
    document.querySelectorAll('.clipboard-item').forEach((item) => {
      item.setAttribute('draggable', 'true');
    });
  }
  
  // Update draggable items whenever the list changes
  const observer = new MutationObserver(updateDraggableItems);
  observer.observe(clipboardListElement, { childList: true });
  
  // Initial setup
  updateDraggableItems();
}

// Enable drag and drop sorting
enableDragSort();

// Show paste notification
function showPasteNotification(index) {
  // Find the element with the corresponding index
  const itemElements = document.querySelectorAll('.clipboard-item');
  if (itemElements.length > index - 1) {
    const itemElement = itemElements[index - 1];
    
    // Create and add notification element
    const notification = document.createElement('div');
    notification.className = 'notification paste-notification';
    
    // Kontrol et: Bu öğe sabitlenmiş mi?
    const isPinned = itemElement.classList.contains('pinned');
    
    // Sabitlenmiş öğe ise farklı mesaj göster
    if (isPinned) {
      notification.textContent = '✅ Sabitlenmiş öğe yapıştırıldı!';
      notification.style.backgroundColor = 'rgba(243, 156, 18, 0.9)'; // Sabitlenmiş öğe rengi
    } else {
      notification.textContent = 'Otomatik olarak yapıştırıldı!';
    }
    
    // Get position of the item element
    const rect = itemElement.getBoundingClientRect();
    notification.style.top = `${rect.top + window.scrollY}px`;
    notification.style.left = `${rect.left + rect.width / 2}px`;
    notification.style.transform = 'translate(-50%, 0) translateZ(0)';
    
    // Add to body
    document.body.appendChild(notification);
    
    // Highlight the item without changing its classes
    const originalBg = itemElement.style.backgroundColor;
    itemElement.style.backgroundColor = isPinned ? 
      'rgba(243, 156, 18, 0.3)' :  // Sabit öğe vurgusu
      'rgba(39, 174, 96, 0.2)';   // Normal öğe vurgusu
    
    // Remove notification after 2 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 300);
      
      // Restore original background
      setTimeout(() => {
        if (document.contains(itemElement)) {
          itemElement.style.backgroundColor = originalBg;
        }
      }, 500);
    }, 2000);
  }
}

// Listen for messages from main process
ipcRenderer.on('show-message', (event, message) => {
  showStatusMessage(message);
});

// Show a status message to the user
function showStatusMessage(message) {
  // Create a status message element
  const statusMsg = document.createElement('div');
  statusMsg.className = 'notification status-message';
  statusMsg.textContent = message;
  statusMsg.style.top = '10px';
  statusMsg.style.left = '50%';
  statusMsg.style.transform = 'translate(-50%, 0) translateZ(0)';
  statusMsg.style.backgroundColor = 'rgba(231, 76, 60, 0.9)';
  
  // Add to body
  document.body.appendChild(statusMsg);
  
  // Remove after 3 seconds
  setTimeout(() => {
    statusMsg.style.opacity = '0';
    setTimeout(() => {
      if (document.body.contains(statusMsg)) {
        document.body.removeChild(statusMsg);
      }
    }, 300);
  }, 3000);
}

// Kısayol tuşunun yerel bir kısayola döndüğü bildirimi
ipcRenderer.on('shortcut-changed-to-local', (event, data) => {
  console.log('Kısayol tuşu yerel hale dönüştürüldü:', data);
  
  let messageTitle = '';
  let messageText = '';
  
  // Kısayol tipine göre uygun mesajı göster
  if (data.type === 'pin') {
    messageTitle = 'Sabitleme Kısayolu Değişti';
    messageText = `${formatShortcut(data.shortcut)} kısayolu sistem tarafından kullanılıyor. Bu kısayol sadece uygulama açıkken çalışacak şekilde ayarlandı.`;
  } else if (data.type === 'paste') {
    messageTitle = 'Yapıştırma Kısayolu Değişti';
    messageText = `${formatShortcut(data.shortcut)} kısayolu sistem tarafından kullanılıyor. Bu kısayol sadece uygulama açıkken çalışacak şekilde ayarlandı.`;
  } else if (data.type === 'toggle') {
    messageTitle = 'Görünürlük Kısayolu Değişti';
    messageText = `${formatShortcut(data.shortcut)} kısayolu sistem tarafından kullanılıyor. Bu kısayol sadece uygulama açıkken çalışacak şekilde ayarlandı.`;
  }
  
  // Mesajı göster
  showNotification(messageTitle, messageText, false, true);
});

// Kısayolu formatla (görüntü için)
function formatShortcut(shortcut) {
  return shortcut
    .replace('CommandOrControl+', 'Ctrl+')
    .replace('Alt+', 'Alt+')
    .replace('Shift+', 'Shift+');
}

// Show a notification to the user
function showNotification(title, text, isError, isPinned) {
  // Create a notification element
  const notification = document.createElement('div');
  notification.className = `notification ${isError ? 'error-message' : 'status-message'} ${isPinned ? 'pinned' : ''}`;
  notification.innerHTML = `
    <h3>${title}</h3>
    <p>${text}</p>
  `;
  notification.style.top = '10px';
  notification.style.left = '50%';
  notification.style.transform = 'translate(-50%, 0) translateZ(0)';
  notification.style.backgroundColor = isError ? 'rgba(231, 76, 60, 0.9)' : 'rgba(231, 76, 60, 0.9)';
  
  // Add to body
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

// Tema değişikliğini dinle
ipcRenderer.on('apply-theme', (event, theme) => {
  console.log(`Tema değişikliği: ${theme}`);
  applyTheme(theme);
});

// Yazı tipi boyutu değişikliğini dinle
ipcRenderer.on('apply-font-size', (event, fontSize) => {
  console.log(`Yazı tipi boyutu değişikliği: ${fontSize}`);
  applyFontSize(fontSize);
});

// Tema uygulama fonksiyonu
function applyTheme(theme) {
  const root = document.documentElement;
  
  // Önce mevcut tema sınıflarını temizle
  root.classList.remove('theme-light', 'theme-dark');
  
  if (theme === 'system') {
    // Sistem temasını algıla
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.add(prefersDark ? 'theme-dark' : 'theme-light');
  } else {
    // Belirtilen temayı uygula
    root.classList.add(`theme-${theme}`);
  }
  
  console.log(`${theme} teması uygulandı`);
}

// Yazı tipi boyutunu uygulama fonksiyonu
function applyFontSize(size) {
  const root = document.documentElement;
  
  // Önce mevcut boyut sınıflarını temizle
  root.classList.remove('font-small', 'font-medium', 'font-large');
  
  // Yeni boyutu uygula
  root.classList.add(`font-${size}`);
  
  console.log(`${size} yazı tipi boyutu uygulandı`);
}

// Sabitlenmiş öğelerin pozisyonlarını güncelle
function refreshPinnedItemsMap() {
  console.log('Sabitlenmiş öğeler haritası güncelleniyor...');
  
  // İşlemi sadece bir kez yürütmek için durumu izleyelim
  if (window.isRefreshingPinnedMap) {
    console.log('Zaten bir güncelleme işlemi devam ediyor, atlıyoruz');
    return;
  }
  
  window.isRefreshingPinnedMap = true;
  
  // IPC'den pinned-positions mesajını al
  ipcRenderer.send('get-pinned-positions');
  
  // Sabitlenmiş öğelerin pozisyonlarını işle
  ipcRenderer.once('pinned-positions', (event, positions) => {
    console.log('IPC\'den alınan sabitlenmiş pozisyonlar:', positions);
    
    // Global pozisyonlar objesini güncelle
    globalPinnedPositions = positions && typeof positions === 'object' ? {...positions} : {};
    
    // Her sabitlenmiş pozisyonu kontrol et
    for (const pos in globalPinnedPositions) {
      // Bu pozisyondaki öğe var mı?
      const itemId = globalPinnedPositions[pos];
      
      // Öğe var mı kontrol et
      const itemExists = clipboardItems.some(item => Number(item.id) === Number(itemId));
      
      if (!itemExists) {
        console.warn(`Pozisyon ${pos} için öğe bulunamadı (ID: ${itemId}). Pozisyon temizleniyor.`);
        delete globalPinnedPositions[pos];
        
        // Ana süreçteki kaydı da temizle
        ipcRenderer.send('unpin-item', itemId);
      }
    }
    
    // İşlem tamamlandı
    window.isRefreshingPinnedMap = false;
  });
} 