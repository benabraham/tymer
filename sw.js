if(!self.define){let e,i={};const n=(n,s)=>(n=new URL(n+".js",s).href,i[n]||new Promise((i=>{if("document"in self){const e=document.createElement("script");e.src=n,e.onload=i,document.head.appendChild(e)}else e=n,importScripts(n),i()})).then((()=>{let e=i[n];if(!e)throw new Error(`Module ${n} didn’t register its module`);return e})));self.define=(s,r)=>{const o=e||("document"in self?document.currentScript.src:"")||location.href;if(i[o])return;let f={};const t=e=>n(e,o),c={module:{uri:o},exports:f,require:t};i[o]=Promise.all(s.map((e=>c[e]||t(e)))).then((e=>(r(...e),f)))}}define(["./workbox-5ffe50d4"],(function(e){"use strict";self.skipWaiting(),e.clientsClaim(),e.precacheAndRoute([{url:"assets/index-Bk1snjZ3.css",revision:null},{url:"assets/index-Dr2ZmNgO.js",revision:null},{url:"index.html",revision:"febd2295e0dbc6f68835a2e09e4a202f"},{url:"registerSW.js",revision:"e35a5b631343531c608a40640198730a"},{url:"apple-touch-icon.png",revision:"234f6d16574e795d4a253854eaf31356"},{url:"favicon.ico",revision:"22b152ea656df4d552e890de221bfcb1"},{url:"icon-192x192.png",revision:"27a3f5b820946dfcec094885992904ff"},{url:"icon-512x512.png",revision:"bd82b3f374032e61e8968c612c4fa82e"},{url:"masked-icon.svg",revision:"5b6ddc430725a23b5a57737f9c5bbd26"},{url:"manifest.webmanifest",revision:"c0ed9045ff0ff3e154936b8f58c134a1"}],{}),e.cleanupOutdatedCaches(),e.registerRoute(new e.NavigationRoute(e.createHandlerBoundToURL("index.html")))}));
