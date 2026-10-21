const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const DEFAULT_MOVIE_DIR = 'D:\\Nirudpal Bharali\\Movies & Series';
const VIDEO_EXTENSIONS = new Set(['.mp4','.m4v','.mkv','.avi','.mov','.wmv','.webm','.mpeg','.mpg','.ts','.3gp','.ogv','.flv','.vob']);
let mainWindow;

function settingsPath(){ return path.join(app.getPath('userData'),'library.json'); }
function readSettings(){
  try {
    const data=JSON.parse(fs.readFileSync(settingsPath(),'utf8'));
    if(data && Array.isArray(data.folders)) return {...data, tmdbApiKey: data.tmdbApiKey || '', metadataCache: data.metadataCache || {}};
  } catch(_){}
  return {folders:[DEFAULT_MOVIE_DIR],lastFolder:DEFAULT_MOVIE_DIR,tmdbApiKey:'',metadataCache:{}};
}
function writeSettings(s){fs.mkdirSync(path.dirname(settingsPath()),{recursive:true});fs.writeFileSync(settingsPath(),JSON.stringify(s,null,2),'utf8');}
function safeStat(p){try{return fs.statSync(p)}catch(_){return null}}
function cleanTitle(name){
  return path.basename(name,path.extname(name))
    .replace(/\[[^\]]*\]/g,' ').replace(/\([^)]*(?:1080p|720p|2160p|bluray|web.?dl|x26[45]|h\.?26[45]|hdr|proper|repack)[^)]*\)/ig,' ')
    .replace(/\b(2160p|1080p|720p|480p|4k|uhd|bluray|brrip|bdrip|webrip|web-dl|webdl|hdtv|dvdrip|x264|x265|h264|h265|hevc|aac|dts|hdr10?|proper|repack|10bit|8bit|yify|yts|rarbg)\b/ig,' ')
    .replace(/[._]+/g,' ').replace(/\s+/g,' ').trim().replace(/[-\s]+$/,'');
}
function parseEpisode(name, fullPath){
  const base=path.basename(name,path.extname(name));
  let m=base.match(/^(.*?)\s*[._ -]*S(\d{1,2})\s*E(\d{1,3})(?:\s*[-E]\s*\d{1,3})?/i);
  if(m) return {seriesTitle:cleanTitle(m[1]) || cleanTitle(path.basename(path.dirname(fullPath))), season:Number(m[2]), episode:Number(m[3])};
  m=base.match(/^(.*?)\s*(?:Season|S)\s*(\d{1,2})\s*(?:Episode|Ep|E)\s*(\d{1,3})/i);
  if(m) return {seriesTitle:cleanTitle(m[1]) || cleanTitle(path.basename(path.dirname(fullPath))), season:Number(m[2]), episode:Number(m[3])};
  const dirs=fullPath.split(path.sep);
  const seasonDir=dirs.slice().reverse().find(x=>/^(season|series)\s*\d+/i.test(x));
  const parent=path.basename(path.dirname(fullPath));
  if(seasonDir){
    const sm=seasonDir.match(/\d+/), em=base.match(/(?:episode|ep|e)\s*0*(\d{1,3})/i);
    if(em) return {seriesTitle:cleanTitle(dirs[Math.max(0,dirs.lastIndexOf(seasonDir)-1)]||parent),season:Number(sm?.[0]||1),episode:Number(em[1])};
  }
  return null;
}
function scanFolder(folderPath){
  const st=safeStat(folderPath); if(!st||!st.isDirectory()) return [];
  const result=[], stack=[{dir:folderPath,depth:0}], maxDepth=8;
  while(stack.length){
    const cur=stack.pop(); let entries=[];
    try{entries=fs.readdirSync(cur.dir,{withFileTypes:true})}catch(_){continue}
    for(const ent of entries){
      const full=path.join(cur.dir,ent.name);
      if(ent.isDirectory()){
        if(cur.depth<maxDepth&&!ent.name.startsWith('$')&&!['System Volume Information','$RECYCLE.BIN','node_modules'].includes(ent.name)) stack.push({dir:full,depth:cur.depth+1});
      }else if(ent.isFile()&&VIDEO_EXTENSIONS.has(path.extname(ent.name).toLowerCase())){
        const fsStat=safeStat(full);if(!fsStat)continue;
        const ep=parseEpisode(ent.name,full);
        result.push({id:full,name:ent.name,title:cleanTitle(ent.name),path:full,folder:folderPath,size:fsStat.size,modified:fsStat.mtimeMs,extension:path.extname(ent.name).slice(1).toUpperCase(),series:!!ep,seriesTitle:ep?.seriesTitle||'',season:ep?.season??null,episode:ep?.episode??null});
      }
    }
  }
  return result;
}
function scanAll(){
  const s=readSettings(), unique=new Map();
  for(const f of s.folders) for(const m of scanFolder(f)) unique.set(m.path.toLowerCase(),m);
  return [...unique.values()].sort((a,b)=>a.title.localeCompare(b.title,undefined,{numeric:true,sensitivity:'base'}));
}
function cacheKey(m){return m.path.toLowerCase()+'|'+m.modified}
function tmdbImageUrl(posterPath){return posterPath?'https://image.tmdb.org/t/p/w500'+posterPath:''}
async function tmdbSearch(query,type,key){
  const endpoint=type==='tv'?'tv':'movie';
  const url=`https://api.themoviedb.org/3/search/${endpoint}?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(query)}&include_adult=false`;
  const res=await fetch(url,{headers:{accept:'application/json'}});
  if(!res.ok) throw new Error(`TMDB search failed (${res.status})`);
  const data=await res.json();
  return (data.results||[]).slice(0,5);
}
async function downloadPoster(posterPath,mediaId,type){
  if(!posterPath)return '';
  const dir=path.join(app.getPath('userData'),'posters');fs.mkdirSync(dir,{recursive:true});
  const dest=path.join(dir,`${type}-${mediaId}.jpg`);
  if(fs.existsSync(dest))return pathToFileURL(dest).href;
  const res=await fetch(tmdbImageUrl(posterPath));
  if(!res.ok) return '';
  const buf=Buffer.from(await res.arrayBuffer());fs.writeFileSync(dest,buf);
  return pathToFileURL(dest).href;
}
async function identifyOne(m,settings){
  const key=cacheKey(m), cached=settings.metadataCache[key];
  if(cached) return {...m,...cached,posterUrl:cached.posterFile&&fs.existsSync(cached.posterFile)?pathToFileURL(cached.posterFile).href:''};
  if(!settings.tmdbApiKey) return m;
  const type=m.series?'tv':'movie', query=m.series?(m.seriesTitle||m.title):m.title;
  try{
    const results=await tmdbSearch(query,type,settings.tmdbApiKey);
    if(!results.length)return m;
    // Prefer the strongest title match; keep the top search result unless another title matches exactly.
    const normalized=query.toLowerCase().replace(/[^a-z0-9]/g,'');
    const exact=results.find(r=>String(type==='tv'?r.name:r.title||'').toLowerCase().replace(/[^a-z0-9]/g,'')===normalized);
    const match=exact||results[0];
    const title=type==='tv'?match.name:match.title;
    const posterFile=match.poster_path?path.join(app.getPath('userData'),'posters',`${type}-${match.id}.jpg`):'';
    let posterUrl='';
    try{posterUrl=await downloadPoster(match.poster_path,match.id,type)}catch(_){}
    const meta={
      metadataFound:true,tmdbId:match.id,mediaType:type,displayTitle:title||query,
      overview:match.overview||'',releaseDate:match.release_date||match.first_air_date||'',
      year:(match.release_date||match.first_air_date||'').slice(0,4),
      genres:[],posterPath:match.poster_path||'',posterFile:posterUrl?posterFile:'',
      posterUrl, voteAverage:match.vote_average||0
    };
    // Query details for accurate genres and full overview.
    try{
      const dres=await fetch(`https://api.themoviedb.org/3/${type}/${match.id}?api_key=${encodeURIComponent(settings.tmdbApiKey)}`);
      if(dres.ok){const d=await dres.json();meta.overview=d.overview||meta.overview;meta.genres=(d.genres||[]).map(g=>g.name);meta.releaseDate=d.release_date||d.first_air_date||meta.releaseDate;meta.year=(meta.releaseDate||'').slice(0,4)}
    }catch(_){}
    settings.metadataCache[key]=meta;
    return {...m,...meta,posterUrl};
  }catch(err){return {...m,metadataError:err.message}}
}
async function enrich(movies){
  const settings=readSettings();
  if(!settings.tmdbApiKey) return movies.map(m=>{
    const c=settings.metadataCache[cacheKey(m)];
    if(!c)return m;
    return {...m,...c,posterUrl:c.posterFile&&fs.existsSync(c.posterFile)?pathToFileURL(c.posterFile).href:''};
  });
  const metaFields=['metadataFound','tmdbId','mediaType','displayTitle','overview','releaseDate','year','genres','posterPath','posterFile','posterUrl','voteAverage'];
  const groups=new Map();
  for(const m of movies){
    const query=m.series?(m.seriesTitle||m.title):m.title;
    const type=m.series?'tv':'movie';
    const groupKey=type+'|'+query.toLowerCase().replace(/[^a-z0-9]/g,'');
    if(!groups.has(groupKey))groups.set(groupKey,{query,type,items:[]});
    groups.get(groupKey).items.push(m);
  }
  const metadataByQuery=new Map();
  const todo=[];
  for(const [groupKey,g] of groups){
    const cachedItem=g.items.find(m=>settings.metadataCache[cacheKey(m)]?.metadataFound);
    if(cachedItem){
      metadataByQuery.set(groupKey,settings.metadataCache[cacheKey(cachedItem)]);
    }else{
      todo.push({groupKey,...g});
    }
  }
  for(let i=0;i<todo.length;i+=3){
    await Promise.all(todo.slice(i,i+3).map(async g=>{
      const result=await identifyOne(g.items[0],settings);
      const meta={};
      for(const field of metaFields) if(result[field]!==undefined)meta[field]=result[field];
      metadataByQuery.set(g.groupKey,meta);
    }));
  }
  const out=[];
  for(const [groupKey,g] of groups){
    const meta=metadataByQuery.get(groupKey)||{};
    for(const m of g.items){
      const pathCacheKey=cacheKey(m);
      const prior=settings.metadataCache[pathCacheKey]||{};
      const merged={...prior,...meta};
      if(Object.keys(merged).length)settings.metadataCache[pathCacheKey]=merged;
      const posterFile=merged.posterFile;
      out.push({...m,...merged,posterUrl:posterFile&&fs.existsSync(posterFile)?pathToFileURL(posterFile).href:(merged.posterUrl||'')});
    }
  }
  writeSettings(settings);
  return out;
}
function groupLibrary(movies){
  const groups=new Map(), singles=[];
  for(const m of movies){
    if(!m.series){singles.push({...m,kind:'movie'});continue}
    const key=(m.seriesTitle||m.title).toLowerCase();
    if(!groups.has(key))groups.set(key,{id:'series:'+key,kind:'series',title:m.displayTitle||m.seriesTitle||m.title,seriesTitle:m.seriesTitle||m.title,mediaType:'tv',episodes:[],genres:m.genres||[],overview:m.overview||'',posterUrl:m.posterUrl||'',year:m.year||''});
    const g=groups.get(key);g.episodes.push(m);
    if(!g.posterUrl&&m.posterUrl)g.posterUrl=m.posterUrl;
    if(!g.overview&&m.overview)g.overview=m.overview;
    if(!g.genres?.length&&m.genres?.length)g.genres=m.genres;
    if(!g.year&&m.year)g.year=m.year;
    if(m.displayTitle)g.title=m.displayTitle;
  }
  for(const g of groups.values()){
    g.episodes.sort((a,b)=>(a.season??1)-(b.season??1)||(a.episode??999)-(b.episode??999)||a.title.localeCompare(b.title));
    g.seasons=[...new Set(g.episodes.map(e=>e.season||1))].sort((a,b)=>a-b);
  }
  return [...singles,...groups.values()].sort((a,b)=>a.title.localeCompare(b.title,undefined,{numeric:true,sensitivity:'base'}));
}
function createWindow(){
  mainWindow=new BrowserWindow({width:1480,height:940,minWidth:900,minHeight:650,backgroundColor:'#090b16',title:'NEEROOD CINEMA',icon:path.join(__dirname,'assets','icon.ico'),autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  mainWindow.loadFile(path.join(__dirname,'index.html'));
}
app.whenReady().then(()=>{
  const s=readSettings();writeSettings(s);
  ipcMain.handle('library:get',async()=>({settings:readSettings(),movies:groupLibrary(await enrich(scanAll()))}));
  ipcMain.handle('library:refresh',async()=>({settings:readSettings(),movies:groupLibrary(await enrich(scanAll()))}));
  ipcMain.handle('library:add-folder',async()=>{
    const picked=await dialog.showOpenDialog(mainWindow,{title:'Add a movie folder',properties:['openDirectory','createDirectory']});
    if(picked.canceled||!picked.filePaths.length)return {canceled:true};
    const folder=path.resolve(picked.filePaths[0]),next=readSettings();
    if(!next.folders.some(x=>x.toLowerCase()===folder.toLowerCase()))next.folders.push(folder);
    next.lastFolder=folder;writeSettings(next);
    return {canceled:false,settings:next,movies:groupLibrary(await enrich(scanAll()))};
  });
  ipcMain.handle('library:remove-folder',async(_e,folder)=>{
    const next=readSettings();next.folders=next.folders.filter(x=>x!==folder);if(!next.folders.length)next.lastFolder='';else if(next.lastFolder===folder)next.lastFolder=next.folders[0];writeSettings(next);
    return {settings:next,movies:groupLibrary(await enrich(scanAll()))};
  });
  ipcMain.handle('library:save-tmdb-key',async(_e,key)=>{
    const next=readSettings();next.tmdbApiKey=String(key||'').trim();writeSettings(next);
    return {settings:next,movies:groupLibrary(await enrich(scanAll()))};
  });
  ipcMain.handle('library:clear-metadata',async()=>{
    const next=readSettings();next.metadataCache={};writeSettings(next);
    return {settings:next,movies:groupLibrary(await enrich(scanAll()))};
  });
  ipcMain.handle('library:play',async(_e,filePath)=>{
    const allowed=scanAll().some(m=>m.path===filePath);if(!allowed)return {ok:false,error:'This video is not in the current library.'};
    return {ok:true,url:pathToFileURL(filePath).href};
  });
  ipcMain.handle('library:show-in-folder',async(_e,filePath)=>{if(!scanAll().some(m=>m.path===filePath))return false;shell.showItemInFolder(filePath);return true});
  ipcMain.handle('library:settings-path',()=>settingsPath());
  ipcMain.handle('window:fullscreen',()=>{if(!mainWindow)return false;mainWindow.setFullScreen(!mainWindow.isFullScreen());return mainWindow.isFullScreen()});
  createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
