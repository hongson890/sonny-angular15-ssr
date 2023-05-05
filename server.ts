import 'zone.js/node';

import { APP_BASE_HREF } from '@angular/common';
import { ngExpressEngine } from '@nguniversal/express-engine';
import express from 'express';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { AppServerModule } from './src/main.server';
import axios from 'axios';
import * as https from 'https';

// The Express app is exported so that it can be used by serverless Functions.
export function app(): express.Express {
  const server = express();
  const distFolder = join(process.cwd(), 'dist/a0-with-ssr/browser');
  const indexHtml = existsSync(join(distFolder, 'index.original.html'))
    ? 'index.original.html'
    : 'index';

  // Our Universal express-engine (found @ https://github.com/angular/universal/tree/main/modules/express-engine)
  server.engine(
    'html',
    ngExpressEngine({
      bootstrap: AppServerModule,
    }),
  );

  server.set('view engine', 'html');
  server.set('views', distFolder);

  // Example Express Rest API endpoints
  // server.get('/api/**', (req, res) => { });
  // Serve static files from /browser
  server.get(
    '*.*',
    express.static(distFolder, {
      maxAge: '1y',
    }),
  );

  server.get('*', async (req: any, res: any) => {
    const currentPath = req.path;
    console.log('currentPath: ', currentPath);
    const regexViewCampaignURLPattern = /^\/campaign\/(\w+)$/;
    const match = currentPath.match(regexViewCampaignURLPattern);
    if (match) {
      try {
        const agent = new https.Agent({
          rejectUnauthorized: false,
        });

        const campaignId = match[1];
        // Fetch the data from the API
        const apiResponse = await axios.get(
          `https://api-testing.lab.intribe.co/v1/anonymous/get-campaign-by-id/${campaignId}`,
          { httpsAgent: agent },
        ); // Replace with your API endpoint

        // Extract the title from the API response
        const title = apiResponse.data.data.name;
        const description = apiResponse.data.data.description;
        let image = null;
        if (apiResponse.data.data?.images) {
          const images = apiResponse.data.data?.images;
          let hasAlbumCover = false;
          for (const field in images) {
            if (images[field].isAlbumCover) {
              image = images[field].dimensionVariants.fullSize.url;
              hasAlbumCover = true;
              break;
            }
          }
          if (!hasAlbumCover) {
            image =
              images['projectBannerGallery$0'].dimensionVariants.fullSize.url;
          }
        }

        // Read the index.html file
        const indexPath = join(distFolder, `${indexHtml}.html`);
        let indexHtmlContent = readFileSync(indexPath, 'utf-8');

        // Generate the dynamic meta tag
        const ogTitleMetaTag = `<meta property="og:title" content="${title}">`;
        const ogDescriptionMetaTag = `<meta property="og:description" content="${description}">`;
        const ogImageMetaTag = `<meta property="og:image" content="${image}">`;

        // Insert the dynamic meta tag into the <head> section of index.html
        indexHtmlContent = indexHtmlContent.replace(
          '<head>',
          `<head>\n${ogTitleMetaTag}\n${ogDescriptionMetaTag}\n${ogImageMetaTag}`,
        );

        res.send(indexHtmlContent);
      } catch (error) {
        console.error('Error fetching data from API:', error);
        res.sendStatus(500);
      }
    } else {
      res.render(indexHtml, {
        req,
        providers: [{ provide: APP_BASE_HREF, useValue: req.baseUrl }],
      });
    }
  });
  return server;
}

function run(): void {
  const port = process.env['PORT'] || 3000;

  // Start up the Node server
  const server = app();
  server.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

// Webpack will replace 'require' with '__webpack_require__'
// '__non_webpack_require__' is a proxy to Node 'require'
// The below code is to ensure that the server is run only when not requiring the bundle.
declare const __non_webpack_require__: NodeRequire;
const mainModule = __non_webpack_require__.main;
const moduleFilename = (mainModule && mainModule.filename) || '';
if (moduleFilename === __filename || moduleFilename.includes('iisnode')) {
  run();
}

export * from './src/main.server';
