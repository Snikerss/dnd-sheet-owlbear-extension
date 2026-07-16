import path from 'path';
import fs from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      clearScreen: false,
      server: {
        port: 3000,
        strictPort: true,
        cors: true,
      },
      plugins: [
        react(),
        {
          name: 'local-character-api',
          configureServer(server) {
            server.middlewares.use((req, res, next) => {
              if (req.url === '/api/characters') {
                const dirPath = path.resolve(__dirname, 'characters');
                const legacyFilePath = path.resolve(__dirname, 'characters.json');

                // Ensure directory exists
                if (!fs.existsSync(dirPath)) {
                  fs.mkdirSync(dirPath, { recursive: true });
                }

                // Legacy migration
                if (fs.existsSync(legacyFilePath)) {
                  try {
                    const legacyContent = fs.readFileSync(legacyFilePath, 'utf-8');
                    const parsed = JSON.parse(legacyContent);
                    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                      for (const [id, charData] of Object.entries(parsed)) {
                        const charFilePath = path.resolve(dirPath, `${id}.json`);
                        fs.writeFileSync(charFilePath, JSON.stringify(charData, null, 2), 'utf-8');
                      }
                    }
                    fs.renameSync(legacyFilePath, path.resolve(__dirname, 'characters.json.bak'));
                  } catch (e) {
                    console.error("Failed to migrate legacy characters.json:", e);
                  }
                }

                if (req.method === 'GET') {
                  const charactersMap: Record<string, any> = {};
                  try {
                    const files = fs.readdirSync(dirPath);
                    for (const file of files) {
                      if (file.endsWith('.json')) {
                        const id = path.basename(file, '.json');
                        const content = fs.readFileSync(path.resolve(dirPath, file), 'utf-8');
                        charactersMap[id] = JSON.parse(content);
                      }
                    }
                  } catch (e) {
                    console.error("Failed to read characters folder:", e);
                  }
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(charactersMap));
                } else if (req.method === 'POST') {
                  const chunks: any[] = [];
                  req.on('data', chunk => {
                    chunks.push(chunk);
                  });
                  req.on('end', () => {
                    try {
                      const body = Buffer.concat(chunks).toString('utf-8');
                      const incomingMap = JSON.parse(body);
                      if (typeof incomingMap === 'object' && incomingMap !== null && !Array.isArray(incomingMap)) {
                        for (const [id, data] of Object.entries(incomingMap)) {
                          const charFilePath = path.resolve(dirPath, `${id}.json`);
                          fs.writeFileSync(charFilePath, JSON.stringify(data, null, 2), 'utf-8');
                        }
                        const files = fs.readdirSync(dirPath);
                        for (const file of files) {
                          if (file.endsWith('.json')) {
                            const id = path.basename(file, '.json');
                            if (!incomingMap[id]) {
                              fs.unlinkSync(path.resolve(dirPath, file));
                            }
                          }
                        }
                      }
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({ success: true }));
                    } catch (e) {
                      console.error("Failed to save characters:", e);
                      res.statusCode = 500;
                      res.end(JSON.stringify({ error: String(e) }));
                    }
                  });
                }
              } else {
                next();
              }
            });
          }
        }
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
