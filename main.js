const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const puppeteer = require('puppeteer');
const axios = require('axios');

let mainWindow;
let browser;
let page;

// Define a persistent user data directory for WhatsApp session
const userDataDir = path.join(app.getPath('userData'), 'whatsapp-profile');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('connect-whatsapp', async () => {
  try {
    browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox'],
      userDataDir: userDataDir // Use persistent user data directory
    });
    
    page = await browser.newPage();
    await page.goto('https://web.whatsapp.com');
    
    // Wait for user to scan QR code and authenticate
    // Using multiple selectors that work in Spanish WhatsApp Web
    console.log('Esperando a que escanees el código QR...');
    
    // Increase timeout to 120 seconds to give more time for scanning
    const authTimeout = 120000;
    
    // Try multiple selectors that indicate successful authentication
    await Promise.any([
      page.waitForSelector('div[data-testid="chat-list"]', { timeout: authTimeout }),
      page.waitForSelector('div[aria-label="Lista de chats"]', { timeout: authTimeout }),
      page.waitForSelector('div[data-icon="chat"]', { timeout: authTimeout }),
      page.waitForSelector('div[data-icon="menu"]', { timeout: authTimeout }),
      page.waitForSelector('span[data-testid="menu"]', { timeout: authTimeout }),
      page.waitForSelector('span[data-testid="default-user"]', { timeout: authTimeout }),
      page.waitForSelector('span[data-icon="default-user"]', { timeout: authTimeout })
    ]).catch(() => {
      throw new Error('Tiempo de espera agotado. Por favor, escanea el código QR para autenticar WhatsApp.');
    });
    
    console.log('¡Autenticación exitosa!');
    
    // Close the browser after successful authentication
    // The session will be saved in the userDataDir
    await browser.close();
    browser = null;
    page = null;
    
    return { success: true };
  } catch (error) {
    console.error('Error connecting to WhatsApp:', error);
    if (browser) {
      await browser.close();
      browser = null;
      page = null;
    }
    return { success: false, error: error.message };
  }
});

ipcMain.handle('send-message', async () => {
  try {
    // Mock webhook call to get phone number
    // In production, replace this with actual webhook call
    const phoneNumber = '34640771321';
    const message = 'Tienes una cita con Ismael Valle';
    const encodedMessage = encodeURIComponent(message);
    const whatsappURL = `https://web.whatsapp.com/send?phone=${phoneNumber}&text=${encodedMessage}`;
    
    // Launch a new browser instance with the same user data directory
    browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox'],
      userDataDir: userDataDir // Use the same persistent user data directory
    });
    
    page = await browser.newPage();
    
    // Navigate directly to the send message URL
    await page.goto(whatsappURL, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Wait for the message input field to be ready
    await page.waitForSelector('div[data-tab="10"]', { timeout: 60000 })
      .catch(() => {
        throw new Error('No encuentre el campo de entrada de mensaje.');
      });
    
    // Wait for the page to be fully loaded and message to be populated
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 5000)));
    
    // Focus on the input field to ensure it's active
    await page.focus('div[data-tab="10"]');
    
    // Wait a bit more to ensure the input is focused
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 1000)));
    
    // Press Enter key to send the message instead of clicking the button
    await page.keyboard.press('Enter');
    
    // Wait longer for the message to be sent
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 5000)));
    
    // Verify message was sent by looking for the message tick
    try {
      await page.waitForSelector('span[data-icon="msg-check"], span[data-icon="msg-dblcheck"]', { timeout: 10000 });
      console.log('Message sent successfully!');
    } catch (err) {
      console.log('Could not verify if message was sent, but no error occurred');
    }
    
    // Close the browser after sending
    await browser.close();
    browser = null;
    page = null;
    
    return { success: true };
  } catch (error) {
    console.error('Error sending message:', error);
    if (browser) {
      await browser.close();
      browser = null;
      page = null;
    }
    return { success: false, error: error.message };
  }
});