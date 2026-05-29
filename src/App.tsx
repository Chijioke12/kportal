import React, { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { 
  FolderArchive, 
  Globe, 
  Settings, 
  Layers, 
  Smartphone, 
  Key, 
  Github, 
  Plus, 
  Trash, 
  Download, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle, 
  Check, 
  Loader, 
  CornerDownRight, 
  BookOpen, 
  Cpu, 
  Eye, 
  EyeOff, 
  Terminal, 
  Upload, 
  Info,
  ExternalLink,
  SmartphoneNfc
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Log interface
interface RegistryLog {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
  timestamp: string;
}

// App configuration
interface GhConfig {
  token: string;
  repo: string;
}

// Parsed application metadata
interface AppMetadata {
  name: string;
  description: string;
  author: string;
  version: string;
  icons?: Record<string, string>;
  type: 'packaged' | 'hosted';
  manifest_url?: string;
  download_url?: string;
  iconBlob?: Blob;
  iconName?: string;
  iconUrl?: string;
}

// Registry app format in apps.json
interface RegistryApp {
  id: string;
  name: string;
  author?: string;
  description?: string;
  icon?: string;
  type: 'packaged' | 'hosted';
  manifest_url?: string;
  download_url?: string;
  version?: string;
}

export default function App() {
  // Custom non-blocking modal alert & confirm state
  const [modalAlert, setModalAlert] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'info' | 'error';
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });

  const [modalConfirm, setModalConfirm] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: (() => void) | null;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null
  });

  const showAlert = (message: string, type: 'success' | 'info' | 'error' = 'info', title: string = 'Notice') => {
    setModalAlert({
      isOpen: true,
      title,
      message,
      type
    });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setModalConfirm({
      isOpen: true,
      title,
      message,
      onConfirm
    });
  };

  // Config state
  const [token, setToken] = useState<string>(() => localStorage.getItem('gh-token') || '');
  const [repo, setRepo] = useState<string>(() => localStorage.getItem('gh-repo') || 'Chijioke12/Open-KaiStore-Registry');
  const [showToken, setShowToken] = useState<boolean>(false);
  const [ghStatus, setGhStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [ghError, setGhError] = useState<string>('');

  // Tab navigation
  const [activeTab, setActiveTab] = useState<'packaged' | 'hosted' | 'manage' | 'installer' | 'settings'>('packaged');

  // Logs
  const [logs, setLogs] = useState<RegistryLog[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Packaged app state
  const [packagedFile, setPackagedFile] = useState<File | null>(null);
  const [packagedMeta, setPackagedMeta] = useState<AppMetadata | null>(null);
  const [packagedIconUrl, setPackagedIconUrl] = useState<string>('');
  
  // Hosted app state
  const [hostedUrlInput, setHostedUrlInput] = useState<string>('');
  const [hostedMeta, setHostedMeta] = useState<AppMetadata | null>(null);
  const [hostedIconUrl, setHostedIconUrl] = useState<string>('');

  // Installer helper state
  const [installType, setInstallType] = useState<'hosted' | 'packaged'>('packaged');
  const [installUrlInput, setInstallUrlInput] = useState<string>('');

  // Registry Management State
  const [registryApps, setRegistryApps] = useState<RegistryApp[]>([]);
  const [loadingRegistry, setLoadingRegistry] = useState<boolean>(false);
  const [deleteFiles, setDeleteFiles] = useState<boolean>(true);
  const [registrySearch, setRegistrySearch] = useState<string>('');

  // Global operations
  const [operationState, setOperationState] = useState<{
    status: 'idle' | 'running' | 'success' | 'error';
    message: string;
    progress: number;
  }>({ status: 'idle', message: '', progress: 0 });

  // On-Device simulation check
  const [detectorMozApps, setDetectorMozApps] = useState<boolean>(false);

  // Trigger scroll to logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);
  
  // Compute registry update details based on matching ID & version
  const getUpdateStatusAndBadge = (appName: string, incomingVersion: string) => {
    const appId = appName.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase();
    const existing = registryApps.find(a => a.id === appId);
    if (!existing) {
      return {
        status: 'new',
        text: '🆕 New Application',
        color: 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/30',
        description: 'This application is not registered in games & apps database registry yet. It will be added as a fresh entry.'
      };
    }
    const currentVersion = existing.version || '0.0.0';
    if (currentVersion === incomingVersion) {
      return {
        status: 'redeploy',
        text: `🔄 Re-deploy (v${incomingVersion})`,
        color: 'bg-blue-950/40 text-blue-400 border border-blue-900/30',
        description: `Version ${incomingVersion} already exists in apps.json registry database. This will build and deploy an update/re-upload for the existing asset.`
      };
    }
    return {
      status: 'upgrade',
      text: `⬆️ Update: v${currentVersion} ➜ v${incomingVersion}`,
      color: 'bg-amber-950/40 text-amber-400 border border-amber-900/30',
      description: `Version v${currentVersion} is currently registered. This publish will trigger an upgrade to the newer build v${incomingVersion}.`
    };
  };

  // Check mozApps API support
  useEffect(() => {
    // navigator.mozApps check
    if (typeof navigator !== 'undefined' && 'mozApps' in navigator) {
      setDetectorMozApps(true);
    }
    addLog('System initialized. Ready for KaiOS app packing and deployment.', 'info');
  }, []);

  // Sync token and repo changes to storage
  const handleSaveConfig = () => {
    localStorage.setItem('gh-token', token.trim());
    localStorage.setItem('gh-repo', repo.trim());
    addLog(`GitHub configuration updated: Repository configured as "${repo.trim()}"`, 'success');
    validateGitHub();
  };

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const time = new Date().toLocaleTimeString();
    const newLog: RegistryLog = {
      id: Math.random().toString(36).substring(2, 9),
      message,
      type,
      timestamp: time
    };
    setLogs(prev => [...prev, newLog]);
  };

  // Safe Unicode Base64 utilities mimicking btoa/atob for wide character ranges
  const safeEncodeUnicode = (str: string): string => {
    try {
      return btoa(
        encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => {
          return String.fromCharCode(parseInt(p1, 16));
        })
      );
    } catch (e) {
      addLog(`Unicode encoding error: ${e instanceof Error ? e.message : String(e)}`, 'error');
      return btoa(str);
    }
  };

  const safeDecodeUnicode = (base64Str: string): string => {
    try {
      return decodeURIComponent(
        Array.prototype.map.call(atob(base64Str.replace(/\s/g, '')), (c: string) => {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join('')
      );
    } catch (e) {
      addLog(`Unicode decoding error: ${e instanceof Error ? e.message : String(e)}`, 'error');
      return atob(base64Str);
    }
  };

  // Convert File/Blob to Base64
  const toBase64 = (blob: Blob | File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  // Test and Validate GitHub Repository / Permissions
  const validateGitHub = async () => {
    if (!token.trim()) {
      setGhStatus('invalid');
      setGhError('GitHub Token is empty.');
      addLog('GitHub check: Missing API Token.', 'error');
      return;
    }
    if (!repo.trim() || !repo.includes('/')) {
      setGhStatus('invalid');
      setGhError('Invalid repository format (should be Owner/Repo).');
      addLog('GitHub check: Invalid Repository format.', 'error');
      return;
    }

    setGhStatus('checking');
    setGhError('');
    addLog(`Validating connection to GitHub repository: ${repo.trim()}`, 'info');

    try {
      const res = await fetch(`https://api.github.com/repos/${repo.trim()}`, {
        headers: {
          'Authorization': `token ${token.trim()}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!res.ok) {
        if (res.status === 401) throw new Error('Unauthorized. Bad GitHub token.');
        if (res.status === 404) throw new Error('Repository not found. Double check repository path and token permissions.');
        throw new Error(`HTTP status code ${res.status}`);
      }

      const data = await res.json();
      setGhStatus('valid');
      addLog(`Validated connection! Target repository: ${data.full_name} (${data.private ? 'Private' : 'Public'})`, 'success');
      
      // Let's also check ifapps.json exists right away
      fetchAppsRegistry();
    } catch (e) {
      setGhStatus('invalid');
      const msg = e instanceof Error ? e.message : 'Unknown connection error';
      setGhError(msg);
      addLog(`Connection check failed: ${msg}`, 'error');
    }
  };

  // Extract metadata and icon from Webapp ZIP (with OmniSD application.zip support)
  const processPackagedFile = async (file: File) => {
    setPackagedFile(file);
    setPackagedMeta(null);
    setPackagedIconUrl('');
    addLog(`Analyzing file: ${file.name} (${(file.size / 1024).toFixed(1)} KB)...`, 'info');

    try {
      const outerZip = await JSZip.loadAsync(file);
      let targetZip = outerZip;
      let isOmniSD = false;

      // OmniSD package standard contains a nested application.zip alongside metadata.json
      const appZipFile = outerZip.file('application.zip');
      if (appZipFile) {
        addLog('OmniSD structure detected! Loading nested application.zip...', 'info');
        const appZipBlob = await appZipFile.async('blob');
        targetZip = await JSZip.loadAsync(appZipBlob);
        isOmniSD = true;
      }

      const manifestFile = targetZip.file('manifest.webapp');
      if (!manifestFile) {
        throw new Error('manifest.webapp file not found in ZIP archive.');
      }

      const manifestText = await manifestFile.async('text');
      const manifest = JSON.parse(manifestText);

      addLog(`Extracted manifest.webapp successfully: "${manifest.name}" v${manifest.version || '1.0'}`, 'success');

      let author = 'Unknown';
      if (manifest.developer) {
        author = typeof manifest.developer === 'string' ? manifest.developer : manifest.developer.name || 'Unknown';
      }

      const metadata: AppMetadata = {
        name: manifest.name,
        description: manifest.description || '',
        author: author,
        version: manifest.version || '1.0.0',
        icons: manifest.icons,
        type: 'packaged'
      };

      // Extract the highest-res icon
      if (manifest.icons) {
        const iconSizes = Object.keys(manifest.icons).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
        if (iconSizes.length > 0) {
          const biggestSize = iconSizes[0];
          const iconPath = manifest.icons[biggestSize];
          
          // Remove leading slash for JSZip file lookups
          const cleanPath = iconPath.startsWith('/') ? iconPath.slice(1) : iconPath;
          const iconFile = targetZip.file(cleanPath);

          if (iconFile) {
            const iconBlob = await iconFile.async('blob');
            const previewUrl = URL.createObjectURL(iconBlob);
            setPackagedIconUrl(previewUrl);
            metadata.iconBlob = iconBlob;
            metadata.iconName = `icon-${biggestSize}.png`;
            addLog(`Extracted application launcher icon: ${cleanPath} (${biggestSize}x${biggestSize})`, 'info');
          } else {
            addLog(`Warning: Icon file defined at "${iconPath}" could not be located in directory tree.`, 'error');
          }
        }
      }

      setPackagedMeta(metadata);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Corrupt ZIP structure';
      addLog(`File processing failed: ${errMsg}`, 'error');
      showAlert(`ZIP Parsing Failed: ${errMsg}`, 'error', 'Error Parsing ZIP');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processPackagedFile(e.dataTransfer.files[0]);
    }
  };

  // Resolve Hosted Manifest URLs
  const handleFetchHostedManifest = async () => {
    const url = hostedUrlInput.trim();
    if (!url) {
      showAlert('Please enter a manifest URL.', 'info', 'Empty Manifest URL');
      return;
    }

    setHostedMeta(null);
    setHostedIconUrl('');
    addLog(`Fetching hosted manifest from: ${url}`, 'info');

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP fetch response: ${res.status}`);
      const manifest = await res.json();

      if (!manifest.name) {
        throw new Error('Valid KaiOS manifest must declare a "name" parameter.');
      }

      let author = 'Unknown';
      if (manifest.developer) {
        author = typeof manifest.developer === 'string' ? manifest.developer : manifest.developer.name || 'Unknown';
      }

      const metadata: AppMetadata = {
        name: manifest.name,
        description: manifest.description || '',
        author: author,
        version: manifest.version || '1.0.0',
        icons: manifest.icons,
        type: 'hosted',
        manifest_url: url
      };

      if (manifest.icons) {
        const iconSizes = Object.keys(manifest.icons).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
        if (iconSizes.length > 0) {
          const iconUrl = manifest.icons[iconSizes[0]];
          const absoluteIconUrl = new URL(iconUrl, url).href;
          setHostedIconUrl(absoluteIconUrl);
          metadata.iconUrl = absoluteIconUrl;
          addLog(`Resolved hosted application launcher icon: ${absoluteIconUrl}`, 'info');
        }
      }

      setHostedMeta(metadata);
      addLog(`Loaded hosted app metadata: "${manifest.name}" v${metadata.version}`, 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid JSON or Network Error';
      addLog(`Failed to fetch hosted manifest: ${msg}. If this happens, it could be a CORS issue. If this is in AI Studio preview, you can host the manifest on a CORS-enabled server or check the URL.`, 'error');
      showAlert(`Fetch failed: ${msg}`, 'error', 'Error Fetching Manifest');
    }
  };

  // Git Atomic Commit Blobs Creator Helper
  const createGitBlob = async (gitRepo: string, gitToken: string, base64Content: string): Promise<string> => {
    const rawBase64 = base64Content.includes(',') ? base64Content.split(',')[1] : base64Content;
    const res = await fetch(`https://api.github.com/repos/${gitRepo}/git/blobs`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${gitToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({ content: rawBase64, encoding: 'base64' })
    });

    if (!res.ok) {
      const errRes = await res.json().catch(() => ({}));
      const details = errRes && errRes.message ? errRes.message : `Status ${res.status}`;
      throw new Error(`Git Blob Creation Failed: ${details}`);
    }

    const data = await res.json();
    return data.sha;
  };

  // Commit dynamic multiple files atomically into repo branch 'main'
  const atomicGitCommit = async (
    gitRepo: string,
    gitToken: string,
    branch: string,
    message: string,
    files: { path: string; sha: string }[]
  ) => {
    // 1. Fetch current reference commit of the branch
    const refUrl = `https://api.github.com/repos/${gitRepo}/git/refs/heads/${branch}?t=${Date.now()}`;
    const refRes = await fetch(refUrl, {
      headers: { 'Authorization': `token ${gitToken}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!refRes.ok) throw new Error(`Could not fetch branch head ref (${refRes.status})`);
    const refData = await refRes.json();
    const baseCommitSha = refData.object.sha;

    // 2. Fetch the base commit's tree
    const commitUrl = `https://api.github.com/repos/${gitRepo}/git/commits/${baseCommitSha}`;
    const commitRes = await fetch(commitUrl, {
      headers: { 'Authorization': `token ${gitToken}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!commitRes.ok) throw new Error(`Could not fetch details of base commit (${commitRes.status})`);
    const commitData = await commitRes.json();
    const baseTreeSha = commitData.tree.sha;

    // 3. Create a new Tree extending the base tree with our files
    const treeItems = files.map(f => ({
      path: f.path,
      mode: '100644',
      type: 'blob',
      sha: f.sha
    }));

    const treeRes = await fetch(`https://api.github.com/repos/${gitRepo}/git/trees`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${gitToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeItems
      })
    });
    if (!treeRes.ok) throw new Error(`Git tree registration failed (${treeRes.status})`);
    const treeData = await treeRes.json();
    const newTreeSha = treeData.sha;

    // 4. Create the final commit object
    const newCommitRes = await fetch(`https://api.github.com/repos/${gitRepo}/git/commits`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${gitToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        message,
        tree: newTreeSha,
        parents: [baseCommitSha]
      })
    });
    if (!newCommitRes.ok) throw new Error(`Failed to initialize commit payload (${newCommitRes.status})`);
    const newCommitData = await newCommitRes.json();
    const newCommitSha = newCommitData.sha;

    // 5. Update the git HEAD reference atomically
    const updateRefRes = await fetch(`https://api.github.com/repos/${gitRepo}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${gitToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({ sha: newCommitSha })
    });
    if (!updateRefRes.ok) {
      if (updateRefRes.status === 422) {
        // Simple retry in case of concurrent merges on branch
        addLog('Merge transaction collision detected. Retrying registration atomically...', 'info');
        return atomicGitCommit(gitRepo, gitToken, branch, message, files);
      }
      const errRes = await updateRefRes.json().catch(() => ({}));
      throw new Error(errRes && errRes.message ? errRes.message : 'Reference push update failed.');
    }
  };

  // Fetch current apps.json registry
  const fetchAppsJson = async (gitRepo: string, gitToken: string): Promise<RegistryApp[]> => {
    const rawUrl = `https://api.github.com/repos/${gitRepo}/contents/apps.json?t=${Date.now()}`;
    const res = await fetch(rawUrl, {
      headers: { 'Authorization': `token ${gitToken}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (res.status === 404) {
      addLog('apps.json registry file does not exist on repository yet. Creating a new database file.', 'info');
      return [];
    }
    if (!res.ok) throw new Error(`Could not fetch apps.json: HTTP ${res.status}`);
    const data = await res.json();
    try {
      const decodedText = safeDecodeUnicode(data.content);
      const parsed = JSON.parse(decodedText);
      return parsed.apps || [];
    } catch (e) {
      addLog('Stored apps.json holds invalid JSON formatting. Resetting database registry list.', 'error');
      return [];
    }
  };

  // Main Deployer Core Function for Packaged ZIPs
  const handleDeployPackaged = async () => {
    if (!token.trim() || !repo.trim()) {
      showAlert('GitHub connection settings are incomplete. Set credentials in Settings first.', 'error', 'Configuration Incomplete');
      setActiveTab('settings');
      return;
    }
    if (!packagedFile || !packagedMeta) {
      showAlert('Select or drag a KaiOS Packaged ZIP first.', 'info', 'No package selected');
      return;
    }

    setOperationState({ status: 'running', message: 'Readying atomic commit sequence...', progress: 10 });
    addLog(`Initiating Deployment sequence for Packaged application: "${packagedMeta.name}"`, 'info');

    try {
      const cleanRepo = repo.trim();
      const cleanToken = token.trim();
      const appId = packagedMeta.name.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase();

      // Files that will be bundled together
      const filesForCommit: { path: string; sha: string }[] = [];

      // A. Write and upload ZIP file blob
      setOperationState((prev) => ({ ...prev, message: 'Encoding application bundle to Base64...', progress: 25 }));
      const zipBase64 = await toBase64(packagedFile);
      const zipPath = `apps/${appId}.zip`;
      
      addLog(`Creating ZIP artifact blob at "${zipPath}"...`, 'info');
      const zipSha = await createGitBlob(cleanRepo, cleanToken, zipBase64);
      filesForCommit.push({ path: zipPath, sha: zipSha });
      addLog('Packaged zip file encoded and registered into git stage.', 'success');

      // B. Write and upload Icon blob if exists
      let iconUrl = '';
      if (packagedMeta.iconBlob && packagedMeta.iconName) {
        setOperationState(prev => ({ ...prev, message: 'Uploading launcher icon payload...', progress: 45 }));
        const iconBase64 = await toBase64(packagedMeta.iconBlob);
        const iconPath = `icons/${appId}-${packagedMeta.iconName}`;
        
        addLog(`Creating icon blob at "${iconPath}"...`, 'info');
        const iconSha = await createGitBlob(cleanRepo, cleanToken, iconBase64);
        filesForCommit.push({ path: iconPath, sha: iconSha });
        iconUrl = `https://raw.githubusercontent.com/${cleanRepo}/main/${iconPath}`;
        addLog('Launcher icon uploaded and staged successfully.', 'success');
      }

      // C. Generate and upload local MINI-MANIFEST .webapp file required for installation
      setOperationState(prev => ({ ...prev, message: 'Formulating mini install manifest...', progress: 65 }));
      const miniManifest = {
        name: packagedMeta.name,
        package_path: `https://raw.githubusercontent.com/${cleanRepo}/main/${zipPath}`,
        version: packagedMeta.version,
        developer: {
          name: packagedMeta.author
        }
      };

      const miniManifestContent = JSON.stringify(miniManifest, null, 2);
      const manifestBase64 = "data:application/json;base64," + safeEncodeUnicode(miniManifestContent);
      const manifestPath = `manifests/${appId}.webapp`;

      addLog(`Creating mini-manifest at "${manifestPath}"...`, 'info');
      const manifestSha = await createGitBlob(cleanRepo, cleanToken, manifestBase64);
      filesForCommit.push({ path: manifestPath, sha: manifestSha });

      // Githack proxies with raw application headers, essential for MozApps CORS install
      const manifestInstallUrl = getGithackManifestUrl(cleanRepo, appId);

      // D. Read current registry lists, append new entry, write to apps.json state
      setOperationState(prev => ({ ...prev, message: 'Updating central store registry stats...', progress: 80 }));
      const appsList = await fetchAppsJson(cleanRepo, cleanToken);
      
      const updatedRegistryEntry: RegistryApp = {
        id: appId,
        name: packagedMeta.name,
        author: packagedMeta.author,
        description: packagedMeta.description,
        icon: iconUrl,
        type: 'packaged',
        manifest_url: manifestInstallUrl,
        download_url: `https://raw.githubusercontent.com/${cleanRepo}/main/${zipPath}`,
        version: packagedMeta.version
      };

      const existingIndex = appsList.findIndex(a => a && a.id === appId);
      if (existingIndex > -1) {
        appsList[existingIndex] = updatedRegistryEntry;
        addLog(`Item "${appId}" already exists in apps.json registry database. Replacing old entry.`, 'info');
      } else {
        appsList.push(updatedRegistryEntry);
        addLog(`Appending new record "${appId}" to apps.json list.`, 'info');
      }

      const rawRegistryText = JSON.stringify({ apps: appsList }, null, 2);
      const registryBase64 = "data:application/json;base64," + safeEncodeUnicode(rawRegistryText);
      
      addLog('Uploading database change log to apps.json...', 'info');
      const registrySha = await createGitBlob(cleanRepo, cleanToken, registryBase64);
      filesForCommit.push({ path: 'apps.json', sha: registrySha });

      // E. Fire Single atomic Commit
      setOperationState(prev => ({ ...prev, message: 'Running atomic transaction on branch HEAD...', progress: 90 }));
      addLog(`Committing ${filesForCommit.length} modified files in single transaction to "main" branch.`, 'info');
      await atomicGitCommit(cleanRepo, cleanToken, 'main', `Deploy Packaged app: ${packagedMeta.name} v${packagedMeta.version}`, filesForCommit);

      setOperationState({ status: 'success', message: 'Publishing complete!', progress: 100 });
      addLog(`Awesome! "${packagedMeta.name}" successfully committed and published!`, 'success');
      showAlert(`Success! "${packagedMeta.name}" has been packed and registered inside "${cleanRepo}"!`, 'success', 'Deployment Successful');
      
      // Clear wizard
      setPackagedFile(null);
      setPackagedMeta(null);
      setPackagedIconUrl('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Publish processes failed';
      setOperationState({ status: 'error', message: `Deployment Failed: ${msg}`, progress: 100 });
      addLog(`Deployment exception: ${msg}`, 'error');
    }
  };

  // Main Deployer Core Function for Hosted App Manifests
  const handleDeployHosted = async () => {
    if (!token.trim() || !repo.trim()) {
      showAlert('GitHub connection settings are incomplete. Set credentials in Settings first.', 'error', 'Configuration Incomplete');
      setActiveTab('settings');
      return;
    }
    if (!hostedMeta) {
      showAlert('Resolve hosted app specs first.', 'info', 'No Hosted Specs');
      return;
    }

    setOperationState({ status: 'running', message: 'Accessing registry metadata...', progress: 20 });
    addLog(`Initiating Registration process for Hosted manifest: "${hostedMeta.name}"`, 'info');

    try {
      const cleanRepo = repo.trim();
      const cleanToken = token.trim();
      const appId = hostedMeta.name.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase();

      // Read current registry apps.json
      setOperationState(prev => ({ ...prev, message: 'Fetching apps.json...', progress: 40 }));
      const appsList = await fetchAppsJson(cleanRepo, cleanToken);

      const updatedRegistryEntry: RegistryApp = {
        id: appId,
        name: hostedMeta.name,
        author: hostedMeta.author,
        description: hostedMeta.description,
        icon: hostedIconUrl || '',
        type: 'hosted',
        manifest_url: hostedMeta.manifest_url,
        version: hostedMeta.version
      };

      const existingIndex = appsList.findIndex(a => a && a.id === appId);
      if (existingIndex > -1) {
        appsList[existingIndex] = updatedRegistryEntry;
        addLog(`Item "${appId}" already exists. Replacing existing registration entry.`, 'info');
      } else {
        appsList.push(updatedRegistryEntry);
        addLog(`Appended hosted app entry "${appId}" to list.`, 'info');
      }

      setOperationState(prev => ({ ...prev, message: 'Updating apps.json registry database...', progress: 70 }));
      const rawRegistryText = JSON.stringify({ apps: appsList }, null, 2);
      const registryBase64 = "data:application/json;base64," + safeEncodeUnicode(rawRegistryText);
      const registrySha = await createGitBlob(cleanRepo, cleanToken, registryBase64);

      setOperationState(prev => ({ ...prev, message: 'Committing registry index update...', progress: 90 }));
      await atomicGitCommit(cleanRepo, cleanToken, 'main', `Register Hosted app: ${hostedMeta.name}`, [
        { path: 'apps.json', sha: registrySha }
      ]);

      setOperationState({ status: 'success', message: 'Publishing complete!', progress: 100 });
      addLog(`Success! Hosted application "${hostedMeta.name}" added to registry store.`, 'success');
      showAlert(`Success! Hosted app registration complete inside apps.json.`, 'success', 'Registration Successful');
      
      // Clear wizard
      setHostedUrlInput('');
      setHostedMeta(null);
      setHostedIconUrl('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Publish processes failed';
      setOperationState({ status: 'error', message: `Registration Failed: ${msg}`, progress: 100 });
      addLog(`Deployment exception: ${msg}`, 'error');
    }
  };

  // Fetch registry list for management tab
  const fetchAppsRegistry = async () => {
    if (!token.trim() || !repo.trim()) {
      addLog('Registry Management: Set up GitHub connection to pull app lists.', 'info');
      return;
    }

    setLoadingRegistry(true);
    addLog('Pulling index list from apps.json...', 'info');

    try {
      const list = await fetchAppsJson(repo.trim(), token.trim());
      setRegistryApps(list);
      addLog(`Loaded ${list.length} installed apps from remote apps.json registry.`, 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Fetch Failed';
      addLog(`Could not load store list: ${msg}`, 'error');
    } finally {
      setLoadingRegistry(false);
    }
  };

  // Helper resolving githack.com proxy for packaged app installation
  const getGithackManifestUrl = (gitRepo: string, appId: string): string => {
    const parts = gitRepo.split('/');
    if (parts.length !== 2) return '';
    return `https://raw.githack.com/${parts[0]}/${parts[1]}/main/manifests/${appId}.webapp`;
  };

  // Helper extracting local git relative path from raw.githubusercontent path
  const extractLocalPathFromGithubUrl = (gitRepo: string, urlStr?: string): string | null => {
    if (!urlStr) return null;
    const searchStr = `https://raw.githubusercontent.com/${gitRepo}/main/`;
    if (urlStr.startsWith(searchStr)) {
      return urlStr.replace(searchStr, '');
    }
    return null;
  };

  // Delete repo content file helper
  const deleteRepoFile = async (gitRepo: string, path: string, gitToken: string, commitMsg: string) => {
    try {
      const url = `https://api.github.com/repos/${gitRepo}/contents/${path}?t=${Date.now()}`;
      const res = await fetch(url, {
        headers: { 'Authorization': `token ${gitToken}`, 'Accept': 'application/vnd.github.v3+json' }
      });
      if (res.status === 404) return; // File already deleted
      if (!res.ok) throw new Error(`Fetch old path failed with status: ${res.status}`);
      const data = await res.json();
      const sha = data.sha;

      if (!sha) return;

      const delRes = await fetch(`https://api.github.com/repos/${gitRepo}/contents/${path}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `token ${gitToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({
          message: commitMsg,
          sha
        })
      });

      if (!delRes.ok) {
        throw new Error(`Git API response failed when purging "${path}": Status ${delRes.status}`);
      }
      addLog(`Permanently deleted repo asset file: "${path}"`, 'success');
    } catch (e) {
      addLog(`Error deleting file "${path}": ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  // Delete App process (Registry and File cleanup)
  const handleDeleteApp = async (appId: string) => {
    const cleanRepo = repo.trim();
    const cleanToken = token.trim();

    if (!cleanRepo || !cleanToken) {
      showAlert('Settings missing.', 'error', 'Configuration Error');
      return;
    }

    const app = registryApps.find(a => a.id === appId);
    if (!app) return;

    const confirmMsg = deleteFiles 
      ? `Are you sure you want to remove "${app.name}" from apps.json database and delete all packaged deployment files (.zip, webapp, icons) from your GitHub repository?`
      : `Are you sure you want to remove ${app.name} from the apps.json registry database? (The raw repository files will remain unaltered)`;

    showConfirm('Confirm Deletion', confirmMsg, async () => {
      setLoadingRegistry(true);
      addLog(`Initiating deletion sequence for registry item "${appId}"`, 'info');

      try {
        // 1. Fetch current index
        const freshAppsList = await fetchAppsJson(cleanRepo, cleanToken);
        const updatedAppsList = freshAppsList.filter(a => a && a.id !== appId);

        // 2. Commit updated registry index
        const rawText = JSON.stringify({ apps: updatedAppsList }, null, 2);
        const registryBase64 = "data:application/json;base64," + safeEncodeUnicode(rawText);
        const registrySha = await createGitBlob(cleanRepo, cleanToken, registryBase64);

        addLog('Updating apps.json list index and executing commit...', 'info');
        await atomicGitCommit(cleanRepo, cleanToken, 'main', `Registry Delete: Purge App "${app.name}"`, [
          { path: 'apps.json', sha: registrySha }
        ]);
        addLog(`Registry apps.json updated. Removed item reference code "${appId}".`, 'success');

        // 3. Optional: Delete the absolute raw files (.zip, launcher icon, mini-manifest)
        if (deleteFiles) {
          addLog('"Clean Associated Files" is active. Initializing individual file purges...', 'info');
          
          // Purge ZIP
          const zipRelPath = extractLocalPathFromGithubUrl(cleanRepo, app.download_url);
          if (zipRelPath) {
            addLog(`Deleting ZIP file: "${zipRelPath}"`, 'info');
            await deleteRepoFile(cleanRepo, zipRelPath, cleanToken, `Purged app zip for deleted app "${app.name}"`);
          }

          // Purge icon image
          const iconRelPath = extractLocalPathFromGithubUrl(cleanRepo, app.icon);
          if (iconRelPath) {
            addLog(`Deleting launcher icon: "${iconRelPath}"`, 'info');
            await deleteRepoFile(cleanRepo, iconRelPath, cleanToken, `Purged icon for deleted app "${app.name}"`);
          }

          // Purge Mini Webapp manifest
          const manifestRelativePath = `manifests/${appId}.webapp`;
          addLog(`Deleting installer mini-manifest: "${manifestRelativePath}"`, 'info');
          await deleteRepoFile(cleanRepo, manifestRelativePath, cleanToken, `Purged mini-manifest for deleted app "${app.name}"`);
        }

        setRegistryApps(updatedAppsList);
        addLog(`Successfully purged "${app.name}" from KaiOS Store assets!`, 'success');
        showAlert(`Successfully purged "${app.name}".`, 'success', 'Purge Success');
      } catch(e) {
        const msg = e instanceof Error ? e.message : 'Deletion failure';
        addLog(`Purge process aborted: ${msg}`, 'error');
        showAlert(`Pure failed: ${msg}`, 'error', 'Purge Failed');
      } finally {
        setLoadingRegistry(false);
      }
    });
  };

  // mozApps Install API Launcher
  const installAppToDevice = async () => {
    const url = installUrlInput.trim();
    if (!url) {
      showAlert('Define an app manifest installation URL first.', 'info', 'Missing URL');
      return;
    }

    const nav = navigator as any;
    if (!nav.mozApps) {
      showAlert('On-device Installation interface (navigator.mozApps API) cannot be detected in this browser context.\nTo trigger installations, run this portal inside a KaiOS device browser or desktop emulator.', 'info', 'Interface Missing');
      return;
    }

    try {
      addLog(`Deploying installation command to simulator/hardware. Triggering mozApps api...`, 'info');
      
      if (installType === 'hosted') {
        const req = nav.mozApps.install(url);
        req.onsuccess = () => {
          addLog('Installation request triggered successfully!', 'success');
          showAlert('KaiOS hosted app installation request sent!', 'success', 'Install Initiated');
        };
        req.onerror = function(this: any) {
          const detail = this.error ? this.error.name : 'Unknown Code';
          addLog(`Hosted install error returned: ${detail}`, 'error');
          showAlert(`Installation Failed: ${detail}`, 'error', 'Install Error');
        };
      } else {
        // Packaged apps use installPackage
        if (typeof nav.mozApps.installPackage !== 'function') {
          throw new Error('This KaiOS system version does not support developer "installPackage" API triggers.');
        }
        
        const req = nav.mozApps.installPackage(url);
        req.onsuccess = () => {
          addLog('Packaged ZIP installation launched!', 'success');
          showAlert('KaiOS Packaged app upload initiated!', 'success', 'Install Initiated');
        };
        req.onerror = function(this: any) {
          const detail = this.error ? this.error.name : 'Unknown Code';
          addLog(`Packaged installer error returned: ${detail}`, 'error');
          showAlert(`Installation Failed: ${detail}`, 'error', 'Install Error');
        };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog(`Local installation system crash: ${msg}`, 'error');
      showAlert(`System Error: ${msg}`, 'error', 'Install Crash');
    }
  };

  // Keyboard Navigation simulation for accessibility
  const handleKeyNavigationInfo = () => {
    addLog('KaiOS D-Pad Keyboard Simulation is active on standard inputs. [ArrowUp/Down] handles focus, [Enter] triggers clicks.', 'info');
  };

  // Filter registry list
  const filteredAppsList = registryApps.filter(app => {
    const search = registrySearch.toLowerCase().trim();
    if (!search) return true;
    return (
      app.name?.toLowerCase().includes(search) || 
      app.author?.toLowerCase().includes(search) || 
      app.description?.toLowerCase().includes(search) ||
      app.id?.toLowerCase().includes(search)
    );
  });

  return (
    <div id="kaios-registry-main" className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-orange-600 selection:text-white">
      
      {/* High-contrast Top Banner */}
      <header id="kai-portal-header" className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-4 py-3 sm:px-6 sm:py-4 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-tr from-orange-600 to-amber-500 rounded-lg shadow-lg shadow-orange-950/20 text-white animate-pulse">
              <Smartphone className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-950 border border-orange-800 text-orange-400">
                  KaiOS v2.5 / v3.0 Dev
                </span>
                <span className="text-[10px] sm:text-xs text-slate-400 font-mono">Time (UTC): 13:40</span>
              </div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-2 mt-0.5">
                KaiOS App Registry Portal
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            {/* Status indicators */}
            <div className="flex-1 sm:flex-initial flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-950/50 border border-slate-800 text-sm overflow-hidden">
              <span className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full shrink-0 ${
                ghStatus === 'valid' ? 'bg-emerald-500 shadow-sm shadow-emerald-500' :
                ghStatus === 'checking' ? 'bg-amber-500 animate-spin' :
                ghStatus === 'invalid' ? 'bg-red-500 shadow-sm shadow-red-500' : 'bg-slate-600'
              }`} />
              <span className="text-[10px] sm:text-xs font-mono truncate block text-slate-300">
                {ghStatus === 'valid' ? repo : ghStatus === 'checking' ? 'Syncing...' : 'Disconnected'}
              </span>
            </div>

            <button
              id="header-shortcut-btn"
              onClick={() => handleKeyNavigationInfo()}
              className="p-2 rounded bg-slate-800 border border-slate-700 hover:bg-slate-700 transition active:scale-95 shrink-0"
              title="Simulator Guidance"
            >
              <SmartphoneNfc className="w-4 h-4 text-orange-400" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main id="portal-body" className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left Column Structure - Workspace Tab Controls & Tooling (8 cols) */}
        <section id="portal-content-area" className="lg:col-span-8 flex flex-col gap-5 sm:gap-6">

          {/* Tab Navigation Menu */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-1 sm:p-1.5 flex overflow-x-auto no-scrollbar flex-nowrap sm:flex-wrap gap-1">
            <button
              id="tab-btn-packaged"
              onClick={() => setActiveTab('packaged')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition duration-200 cursor-pointer whitespace-nowrap ${
                activeTab === 'packaged'
                  ? 'bg-orange-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <FolderArchive className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Packaged App (ZIP)
            </button>
            <button
              id="tab-btn-hosted"
              onClick={() => setActiveTab('hosted')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition duration-200 cursor-pointer whitespace-nowrap ${
                activeTab === 'hosted'
                  ? 'bg-orange-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Hosted App (Manifest)
            </button>
            <button
              id="tab-btn-manage"
              onClick={() => {
                setActiveTab('manage');
                fetchAppsRegistry();
              }}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition duration-200 cursor-pointer whitespace-nowrap ${
                activeTab === 'manage'
                  ? 'bg-orange-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Manage Registry
            </button>
            <button
              id="tab-btn-installer"
              onClick={() => setActiveTab('installer')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition duration-200 cursor-pointer whitespace-nowrap ${
                activeTab === 'installer'
                  ? 'bg-orange-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              On-Device Installer
            </button>
            <button
              id="tab-btn-settings"
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition duration-200 cursor-pointer whitespace-nowrap ${
                activeTab === 'settings'
                  ? 'bg-orange-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              GitHub Config
            </button>
          </div>

          {/* Dynamic Tab Panes */}
          <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="h-full"
              >
                {/* TAB: Packaged App File Upload & Processor */}
                {activeTab === 'packaged' && (
              <div id="panel-packaged" className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <FolderArchive className="text-orange-500 w-5 h-5" />
                    Deploy Packaged Application
                  </h2>
                  <p className="text-slate-400 text-sm mt-1">
                    Upload a KaiOS application bundle (.zip). We will automatically parse metadata, extract icons, pack the installer assets, generate the target webapp mini-manifest, and stage it seamlessly.
                  </p>
                </div>

                {/* Drag-Drop Target */}
                <div
                  id="zip-drop-zone"
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  className="border-2 border-dashed border-slate-700 hover:border-orange-500 bg-slate-950/40 rounded-xl p-8 text-center transition-all duration-200 hover:bg-slate-950/70 cursor-pointer group"
                  onClick={() => document.getElementById('packaged-file-input')?.click()}
                >
                  <input
                    type="file"
                    id="packaged-file-input"
                    className="hidden"
                    accept=".zip"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        processPackagedFile(e.target.files[0]);
                      }
                    }}
                  />
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-4 rounded-full bg-slate-900 border border-slate-800 text-slate-400 group-hover:text-orange-500 group-hover:bg-slate-900/80 transition-all duration-300">
                      <Upload className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-slate-200">
                        Drag and drop your application ZIP package here
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Accepts OmniSD application bundles (containing application.zip) or normal packaged app ZIP archives
                      </p>
                    </div>
                    <span className="px-3 py-1 text-xs font-semibold rounded-md bg-orange-600/10 border border-orange-500/20 text-orange-400">
                      Browse Files
                    </span>
                  </div>
                </div>

                {/* Display File Metadata Preview */}
                {packagedFile && (
                  <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 bg-slate-900 rounded border border-slate-700 text-orange-400">
                        <FolderArchive className="w-6 h-6" />
                      </div>
                      <div className="truncate">
                        <p className="text-sm font-semibold text-slate-300 truncate">{packagedFile.name}</p>
                        <p className="text-xs text-slate-500">{(packagedFile.size / 1024).toFixed(1)} KB | Packaged Application</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        setPackagedFile(null);
                        setPackagedMeta(null);
                        setPackagedIconUrl('');
                      }}
                      className="text-xs text-rose-400 hover:text-rose-300 hover:underline px-2.5 py-1 rounded bg-rose-950/20 border border-rose-950/30"
                    >
                      Clear File
                    </button>
                  </div>
                )}

                {/* Parsed Output Details Card */}
                {packagedMeta && (
                  <div className="border border-slate-800 rounded-xl bg-slate-950/70 overflow-hidden divide-y divide-slate-800 animate-fadeIn">
                    <div className="p-4 bg-slate-950 font-bold text-xs tracking-wider uppercase text-slate-400">
                      Inside Package: manifest.webapp Verified
                    </div>
                    <div className="p-5 flex flex-col md:flex-row gap-5 items-center md:items-start text-center md:text-left">
                      {/* Icon preview */}
                      <div className="flex-shrink-0">
                        {packagedIconUrl ? (
                          <img
                            src={packagedIconUrl}
                            alt="App Icon"
                            className="w-16 h-16 rounded-xl border border-slate-800 bg-slate-900 object-contain p-1"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-800 bg-slate-900 flex items-center justify-center text-slate-600 font-mono text-xs">
                            No Icon Available
                          </div>
                        )}
                      </div>

                      {/* Text content */}
                      <div className="flex-1 space-y-2">
                        <div>
                          <h3 className="text-lg font-bold text-white leading-tight">{packagedMeta.name}</h3>
                          <p className="text-xs text-slate-400 mt-1">
                            Developed by <span className="text-orange-400 font-semibold">{packagedMeta.author}</span>
                          </p>
                        </div>
                        <p className="text-sm text-slate-300 leading-relaxed font-sans">
                          {packagedMeta.description || 'No description provided in manifest file.'}
                        </p>
                        
                        <div className="flex flex-wrap gap-2 pt-1 justify-center md:justify-start">
                          <span className="text-xs font-mono bg-slate-900 px-2.5 py-1 rounded text-slate-400 border border-slate-800">
                            Version: <span className="text-slate-200">{packagedMeta.version}</span>
                          </span>
                          <span className="text-xs font-mono bg-slate-900 px-2.5 py-1 rounded text-slate-400 border border-slate-800">
                            Format: <span className="text-slate-200">Packaged (.zip)</span>
                          </span>
                        </div>

                        {(() => {
                          const statusInfo = getUpdateStatusAndBadge(packagedMeta.name, packagedMeta.version);
                          return (
                            <div className={`mt-3 p-3 rounded-lg border text-xs leading-normal space-y-1 text-left ${statusInfo.color}`}>
                              <div className="flex items-center gap-1.5 font-bold tracking-wider text-[10px]">
                                <span>{statusInfo.text}</span>
                              </div>
                              <p className="text-slate-300 text-[11px] font-sans">{statusInfo.description}</p>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Stage settings / warning checks */}
                    <div className="p-5 space-y-3">
                      <div className="flex items-start gap-2 text-xs text-slate-400 bg-slate-900/60 p-3 rounded border border-slate-800">
                        <AlertCircle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-slate-300">Deployment Notice</p>
                          <p className="mt-0.5 text-slate-400 leading-normal">
                            Once deployed, the ZIP and launcher assets are indexed directly in your cloud repository. The installer URI will be generated automatically using high-compatibility <strong>Githack Proxy</strong> to parse the necessary headers during installation on active handsets.
                          </p>
                        </div>
                      </div>

                      <button
                        id="packaged-deploy-btn"
                        onClick={handleDeployPackaged}
                        disabled={operationState.status === 'running' || !ghStatus}
                        className={`w-full py-3.5 rounded-xl text-white font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                          operationState.status === 'running'
                            ? 'bg-slate-800 border border-slate-700 text-slate-500 cursor-not-allowed'
                            : ghStatus === 'valid'
                            ? 'bg-orange-600 hover:bg-orange-500 active:scale-95 shadow-lg shadow-orange-950/20'
                            : 'bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-800 duration-200'
                        }`}
                      >
                        {operationState.status === 'running' ? (
                          <>
                            <Loader className="w-5 h-5 animate-spin text-orange-500 animate-spin" />
                            <span>Processing base64 stages... {operationState.progress}%完成</span>
                          </>
                        ) : ghStatus === 'valid' ? (
                          <>
                            <CheckCircle className="w-5 h-5" />
                            <span>Publish to GitHub Registry Store</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-5 h-5 text-red-400" />
                            <span>Validate GitHub token to unlock Deploying</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
                
                {/* Clean Guide for Packaged Apps */}
                <div className="border border-slate-800 bg-slate-950/30 rounded-xl p-5 space-y-3">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-orange-400" />
                    How It Works
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Under the hood, this process is fully client-side and secure. We read and unpack your ZIP file inside the browser sandbox, extracting the app metadata and launcher icons. The deployment engine then interacts directly with your <strong>GitHub Repository API</strong> to stage and write the app bundle asset, the app launcher icon file, and a custom mini app installer manifest (.webapp), while instantly indexing the new record inside <code>apps.json</code> safely. All database steps are executed within a <strong>Single Transaction commit block</strong> to prevent broken paths.
                  </p>
                </div>
              </div>
            )}

            {/* TAB: Hosted Manifest Deployer */}
            {activeTab === 'hosted' && (
              <div id="panel-hosted" className="space-y-6 animate-fadeIn">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Globe className="text-orange-500 w-5 h-5" />
                    Register Hosted Application
                  </h2>
                  <p className="text-slate-400 text-sm mt-1">
                    Provide a hosted, web-accessible manifest URL. The portal will scan, validate, and register it directly onto your central apps.json store.
                  </p>
                </div>

                {/* Input action */}
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-300 block">Manifest URL (manifest.webapp)</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <input
                        type="url"
                        placeholder="https://example.com/manifest.webapp"
                        value={hostedUrlInput}
                        onChange={(e) => setHostedUrlInput(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 font-mono text-slate-200"
                      />
                    </div>
                    <button
                      id="hosted-fetch-btn"
                      onClick={handleFetchHostedManifest}
                      className="px-5 py-3 rounded-xl bg-orange-600 hover:bg-orange-500 active:scale-95 text-white font-bold text-sm transition shrink-0 flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Fetch Manifest
                    </button>
                  </div>
                  <span className="text-[11px] sm:text-xs text-slate-500 block leading-relaxed">
                    Example format (must serve a valid JSON object declaring Webapp traits)
                  </span>
                </div>

                {/* Resolve metadata details screen */}
                {hostedMeta && (
                  <div className="border border-slate-800 rounded-xl bg-slate-950/70 overflow-hidden divide-y divide-slate-800 animate-fadeIn">
                    <div className="p-4 bg-slate-950 font-bold text-xs tracking-wider uppercase text-slate-400">
                      Inside Hosted Manifest File
                    </div>
                    <div className="p-5 flex flex-col md:flex-row gap-5 items-center md:items-start text-center md:text-left">
                      
                      {/* Icon preview */}
                      <div className="flex-shrink-0">
                        {hostedIconUrl ? (
                          <img
                            src={hostedIconUrl}
                            alt="Hosted Icon"
                            className="w-16 h-16 rounded-xl border border-slate-800 bg-slate-900 object-contain p-1"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-800 bg-slate-900 flex items-center justify-center text-slate-600 font-mono text-xs">
                            No Icon Available
                          </div>
                        )}
                      </div>

                      {/* Text details */}
                      <div className="flex-1 space-y-2">
                        <div>
                          <h3 className="text-lg font-bold text-white leading-tight">{hostedMeta.name}</h3>
                          <p className="text-xs text-slate-400 mt-1">
                            Developed by <span className="text-orange-400 font-semibold">{hostedMeta.author}</span>
                          </p>
                        </div>
                        <p className="text-sm text-slate-300 leading-relaxed font-sans">
                          {hostedMeta.description || 'No description provided in manifest file.'}
                        </p>
                        
                        <div className="flex flex-wrap gap-2 pt-1 justify-center md:justify-start">
                          <span className="text-xs font-mono bg-slate-900 px-2.5 py-1 rounded text-slate-400 border border-slate-800">
                            Version: <span className="text-slate-200">{hostedMeta.version}</span>
                          </span>
                          <span className="text-xs font-mono bg-slate-900 px-2.5 py-1 rounded text-slate-400 border border-slate-800">
                            Format: <span className="text-slate-200">Hosted Application</span>
                          </span>
                        </div>

                        {(() => {
                          const statusInfo = getUpdateStatusAndBadge(hostedMeta.name, hostedMeta.version);
                          return (
                            <div className={`mt-3 p-3 rounded-lg border text-xs leading-normal space-y-1 text-left ${statusInfo.color}`}>
                              <div className="flex items-center gap-1.5 font-bold tracking-wider text-[10px]">
                                <span>{statusInfo.text}</span>
                              </div>
                              <p className="text-slate-300 text-[11px] font-sans">{statusInfo.description}</p>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Operational triggers */}
                    <div className="p-5 space-y-3">
                      <div className="text-xs text-slate-400 bg-slate-900/60 p-3 rounded border border-slate-800 divide-y divide-slate-800/40">
                        <div className="pb-2 font-semibold text-slate-300">Target Origin Address</div>
                        <div className="pt-2 font-mono text-slate-400 word-break-all break-all">{hostedMeta.manifest_url}</div>
                      </div>

                      <button
                        id="hosted-deploy-btn"
                        onClick={handleDeployHosted}
                        disabled={operationState.status === 'running' || !ghStatus}
                        className={`w-full py-3.5 rounded-xl text-white font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                          operationState.status === 'running'
                            ? 'bg-slate-800 border border-slate-700 text-slate-500 cursor-not-allowed'
                            : ghStatus === 'valid'
                            ? 'bg-orange-600 hover:bg-orange-500 active:scale-95 shadow-lg shadow-orange-950/20'
                            : 'bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-805 cursor-not-allowed'
                        }`}
                      >
                        {operationState.status === 'running' ? (
                          <>
                            <Loader className="w-5 h-5 animate-spin text-orange-500 animate-spin" />
                            <span>Updating registry index...</span>
                          </>
                        ) : ghStatus === 'valid' ? (
                          <>
                            <CheckCircle className="w-5 h-5" />
                            <span>Publish to GitHub Registry Store</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-5 h-5 text-red-400" />
                            <span>Validate connection in Settings to publish</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB: Manage Registry Database Grid */}
            {activeTab === 'manage' && (
              <div id="panel-manage" className="space-y-6 animate-fadeIn">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <Layers className="text-orange-500 w-5 h-5" />
                      Repository Manager (apps.json)
                    </h2>
                    <p className="text-slate-400 text-sm mt-1">
                      Search, inspect, and remove applications registered inside the connected repository index.
                    </p>
                  </div>

                  <button
                    id="manage-reload-btn"
                    onClick={fetchAppsRegistry}
                    disabled={loadingRegistry}
                    className="p-2.5 rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-900 transition flex items-center gap-1.5 text-xs text-slate-300 font-bold shrink-0 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingRegistry ? 'animate-spin' : ''}`} />
                    Refresh Index
                  </button>
                </div>

                {/* Custom Search Tool */}
                <div className="flex flex-col sm:flex-row gap-4 items-center bg-slate-950/60 p-3 sm:p-4 rounded-xl border border-slate-800">
                  <div className="relative flex-1 w-full">
                    <input
                      type="text"
                      placeholder="Filter store registry items..."
                      value={registrySearch}
                      onChange={(e) => setRegistrySearch(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm sm:text-base focus:outline-none focus:border-orange-500 text-slate-200"
                    />
                  </div>
                  
                  {/* Cleanup toggle check */}
                  <label className="flex items-center gap-3 shrink-0 select-none cursor-pointer w-full sm:w-auto p-2 sm:p-0 rounded-lg bg-slate-900 sm:bg-transparent border border-slate-800 sm:border-none">
                    <input
                      type="checkbox"
                      checked={deleteFiles}
                      onChange={(e) => setDeleteFiles(e.target.checked)}
                      className="w-5 h-5 sm:w-4.5 sm:h-4.5 accent-orange-500 rounded border-slate-800 cursor-pointer"
                    />
                    <div className="text-left leading-tight">
                      <p className="text-xs font-semibold text-slate-200">Purge Raw Files on Delete</p>
                      <p className="text-[10px] text-slate-500 mt-0.5 sm:hidden lg:block">Cleans assets from branch automatically</p>
                    </div>
                  </label>
                </div>

                {/* App Inventory Grid */}
                {loadingRegistry ? (
                  <div className="border border-slate-800 rounded-xl p-12 text-center bg-slate-950/20">
                    <Loader className="w-8 h-8 animate-spin text-orange-500 mx-auto" />
                    <p className="text-sm text-slate-300 mt-4">Retrieving remote manifest data logs from central database repository...</p>
                  </div>
                ) : registryApps.length === 0 ? (
                  <div className="border border-slate-800 rounded-xl p-12 text-center bg-slate-950/20 text-slate-400">
                    <AlertCircle className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                    <p className="text-base font-semibold text-slate-300">No applications registered</p>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      Make sure your GitHub settings are fully configured, or initiate your very first packaged/hosted app publish to populate apps.json.
                    </p>
                  </div>
                ) : filteredAppsList.length === 0 ? (
                  <div className="border border-slate-800 rounded-xl p-8 text-center bg-slate-950/20 text-slate-400">
                    <p className="text-sm text-slate-400">No registered apps match the filter constraint: "{registrySearch}"</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredAppsList.map((app) => (
                      <div 
                        key={app.id} 
                        className="border border-slate-800 rounded-xl bg-slate-950/60 p-4 hover:border-slate-700 transition flex flex-col justify-between gap-4"
                      >
                        <div className="flex gap-3">
                          <div className="flex-shrink-0">
                            {app.icon ? (
                              <img
                                src={app.icon}
                                alt={app.name}
                                className="w-12 h-12 rounded-lg border border-slate-800 bg-slate-900 object-contain p-0.5"
                                onError={(e) => {
                                  // fallback URL if broken
                                  e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 24 24' fill='none' stroke='%23ea580c' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='18' height='18' x='3' y='3' rx='2'%3E%3C/rect%3E%3Cpath d='M9 17h6'%3E%3C/path%3E%3Cpath d='M9 12h6'%3E%3C/path%3E%3Cpath d='M9 7h6'%3E%3C/path%3E%3C/svg%3E";
                                }}
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-lg border border-slate-800 bg-slate-900 flex items-center justify-center text-slate-500 font-mono text-[10px]">
                                ZIP
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h4 className="text-sm font-bold text-white truncate">{app.name}</h4>
                              <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full ${
                                app.type === 'packaged'
                                  ? 'bg-orange-950/50 border border-orange-900/40 text-orange-400'
                                  : 'bg-emerald-950/50 border border-emerald-900/40 text-emerald-400'
                              }`}>
                                {app.type === 'packaged' ? 'ZIP' : 'Hosted'}
                              </span>
                              {app.version && (
                                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                                  v{app.version}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5 font-semibold">
                              by {app.author || 'Unknown Author'}
                            </p>
                            <p className="text-xs text-slate-300 mt-1 line-clamp-2 leading-relaxed h-[36px]">
                              {app.description || 'No description asset listed.'}
                            </p>
                          </div>
                        </div>

                        {/* Inventory info action */}
                        <div className="pt-3 border-t border-slate-900/50 flex items-center justify-between gap-2">
                          <div className="flex gap-2">
                            {app.manifest_url && (
                              <a
                                href={app.manifest_url}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1 px-2 rounded bg-slate-905 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white transition text-[10px] font-mono flex items-center gap-1 cursor-pointer"
                                title="App Manifest Setup File"
                              >
                                Manifest
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                            {app.download_url && (
                              <a
                                href={app.download_url}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1 px-2 rounded bg-slate-905 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white transition text-[10px] font-mono flex items-center gap-1 cursor-pointer"
                                title="Raw Application ZIP"
                              >
                                Download
                                <Download className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>

                          <button
                            onClick={() => handleDeleteApp(app.id)}
                            className="p-1.5 px-3 rounded hover:bg-rose-950/40 border border-transparent hover:border-rose-900 text-rose-400 hover:text-rose-300 transition text-[10px] uppercase font-bold tracking-wider flex items-center gap-1 cursor-pointer"
                            title="Purge App Registry Entry"
                          >
                            <Trash className="w-3 h-3" />
                            Purge
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB: On-Device Installation Wizard */}
            {activeTab === 'installer' && (
              <div id="panel-installer" className="space-y-6 animate-fadeIn">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Smartphone className="text-orange-500 w-5 h-5" />
                    On-Device Developer Installer Helper
                  </h2>
                  <p className="text-slate-400 text-sm mt-1">
                    Directly install applications onto plugged-in KaiOS mobile terminals or testing emulators utilizing standard desktop/handset mozApps developer links.
                  </p>
                </div>

                {/* Compatibility report alerts */}
                {detectorMozApps ? (
                  <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-900/40 text-emerald-400 text-sm flex gap-3 items-start">
                    <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-emerald-200">Device API Active!</p>
                      <p className="text-xs text-emerald-400/90 mt-0.5">
                        The installer has successfully detected the <code>navigator.mozApps</code> developer interface inside this browser environment. You can click to trigger live deployments.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 text-xs leading-relaxed space-y-1">
                    <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                      <Info className="w-4 h-4 text-orange-400" />
                      Installation Interface Notice
                    </div>
                    <p>
                      The on-screen KaiOS browser direct deployment utility requires active WebAPI hooks (<code>navigator.mozApps</code>). Since you are running in a desktop browser container preview, this interface is simulation-only.
                    </p>
                    <p className="pt-1 text-slate-500 font-medium">To establish developer ties and test directly:</p>
                    <ul className="list-disc list-inside space-y-0.5 pl-2 text-slate-500 font-mono">
                      <li>Open this applet inside your actual banana handset browser</li>
                      <li>Or connect your phone via WebIDE using developer root access tools</li>
                    </ul>
                  </div>
                )}

                {/* Custom install interface */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex gap-4 border-b border-slate-900 pb-4">
                    <label className="flex items-center gap-2 text-xs text-slate-300 font-bold select-none cursor-pointer">
                      <input
                        type="radio"
                        name="install-type-radio"
                        checked={installType === 'packaged'}
                        onChange={() => setInstallType('packaged')}
                        className="w-4 h-4 accent-orange-500 cursor-pointer"
                      />
                      Packaged ZIP (installPackage)
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-300 font-bold select-none cursor-pointer">
                      <input
                        type="radio"
                        name="install-type-radio"
                        checked={installType === 'hosted'}
                        onChange={() => setInstallType('hosted')}
                        className="w-4 h-4 accent-orange-500 cursor-pointer"
                      />
                      Hosted App (install)
                    </label>
                  </div>

                  <div className="space-y-3">
                    <label className="text-xs font-semibold text-slate-400 block">
                      {installType === 'packaged' ? 'Installer Mini-Manifest URI (Githack or hosted webapp)' : 'Hosted Application Manifest URL'}
                    </label>
                    
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="url"
                        placeholder={installType === 'packaged' ? 'https://raw.githack.com/Owner/Repo/main/manifests/myapp.webapp' : 'https://example.com/manifest.webapp'}
                        value={installUrlInput}
                        onChange={(e) => setInstallUrlInput(e.target.value)}
                        className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm font-mono text-slate-200 focus:outline-none focus:border-orange-500"
                      />
                      <button
                        onClick={installAppToDevice}
                        className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-sm select-none transition cursor-pointer shrink-0"
                      >
                        Push Install Command
                      </button>
                    </div>
                  </div>
                </div>

                {/* FAQ section */}
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-1">
                    <Cpu className="text-orange-400 w-4 h-4" />
                    Developer Guide: Connecting banana phones
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-400">
                    <div className="p-4 bg-slate-950/40 border border-slate-800 rounded-xl space-y-1.5">
                      <div className="font-semibold text-slate-300">1. Open Debugging Port</div>
                      <p className="leading-relaxed">
                        Dial <strong>*#*#33284#*#*</strong> on your phone. A bug icon should appear in the status bar at the top, signifying debugger ADB port status has been toggled active.
                      </p>
                    </div>
                    <div className="p-4 bg-slate-950/40 border border-slate-800 rounded-xl space-y-1.5">
                      <div className="font-semibold text-slate-300">2. Run WebIDE Simulator</div>
                      <p className="leading-relaxed">
                        Connect via USB to a computer running Pale Moon browser or old Firefox 52 ESR alongside diagnostic tools to run direct terminal side-loads easily.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: settings credentials */}
            {activeTab === 'settings' && (
              <div id="panel-settings" className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Settings className="text-orange-500 w-5 h-5" />
                    GitHub API Integrations Config
                  </h2>
                  <p className="text-slate-400 text-sm mt-1">
                    Configure your GitHub credentials. Your credentials remain inside Local Storage inside your browser. No server ever sees them.
                  </p>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 sm:p-6 space-y-4">
                  
                  {/* Token Field */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300 block">Personal Access Token (PAT)</label>
                    <div className="relative">
                      <input
                        type={showToken ? 'text' : 'password'}
                        placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm font-mono text-slate-200 focus:outline-none focus:border-orange-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        className="absolute right-3 top-3.5 text-slate-500 hover:text-slate-300 transition p-1"
                      >
                        {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <span className="text-[10px] sm:text-[11px] text-slate-500 block leading-relaxed">
                      Requires <strong>repo</strong> permissions so that the portal can write assets, create commits, and delete files on your behalf.
                    </span>
                  </div>

                  {/* Repository Location */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300 block">Repository Path (Owner/Repository)</label>
                    <input
                      type="text"
                      placeholder="Username/RepositoryName"
                      value={repo}
                      onChange={(e) => setRepo(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm font-mono text-slate-200 focus:outline-none focus:border-orange-500"
                    />
                    <span className="text-[10px] sm:text-[11px] text-slate-500 block leading-relaxed">
                      This path must point to an active depository hosting your KaiOS application files and the index database file <code>apps.json</code>.
                    </span>
                  </div>

                  {ghError && (
                    <div className="p-3 bg-rose-950/20 border border-rose-955/30 rounded-lg text-xs text-rose-400 flex items-center gap-2 animate-fadeIn">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{ghError}</span>
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-900 flex flex-col sm:flex-row gap-3">
                    <button
                      id="save-settings-btn"
                      onClick={handleSaveConfig}
                      className="px-6 py-3 bg-orange-600 hover:bg-orange-500 active:scale-95 text-white font-bold rounded-xl transition cursor-pointer text-sm w-full sm:w-auto"
                    >
                      Authenticate and Sync Settings
                    </button>
                    
                    <button
                      id="validate-status-btn"
                      onClick={validateGitHub}
                      disabled={ghStatus === 'checking'}
                      className="px-5 py-3 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-bold rounded-xl transition cursor-pointer text-sm w-full sm:w-auto"
                    >
                      Test Connection
                    </button>
                  </div>
                </div>

                <div className="p-5 border border-slate-800 bg-slate-950/30 rounded-xl text-xs space-y-2">
                  <span className="font-semibold text-slate-200 block">Deploying to KaiOs Stores Notice</span>
                  <p className="text-slate-400 leading-relaxed">
                    By default, KaiOS structures applications into store manifests for developers to register packages easily. To hook apps into pre-existing developer grids (like OmniSD store models), build a public GitHub repository named after your choice, initialize a placeholder <code>apps.json</code> or configure this portal to auto-deploy one from scratch, and connect page trackers easily.
                  </p>
                </div>
              </div>
            )}
              </motion.div>
            </AnimatePresence>
          </div>
        </section>

        {/* Right Column Structure - Retro Console System Log Output (4 cols) */}
        <section id="portal-logs-panel" className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col h-[380px] sm:h-[500px] lg:h-[650px] shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4 shrink-0">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-500 animate-pulse" />
                <h2 className="text-[10px] sm:text-xs uppercase font-extrabold tracking-widest text-slate-300">
                  Transaction Stream Log
                </h2>
              </div>
              <button
                id="clear-logs-btn"
                onClick={() => setLogs([])}
                className="text-[9px] sm:text-[10px] text-slate-500 hover:text-slate-300 uppercase font-extrabold tracking-wider bg-slate-950 px-2 py-1 rounded border border-slate-850 active:scale-95 transition"
              >
                Clear Log
              </button>
            </div>

            {/* Simulated Live CRT terminal feel */}
            <div className="flex-1 bg-slate-950 border border-slate-850 rounded-xl font-mono text-xs p-4 overflow-y-auto space-y-3 relative shadow-inner">
              <div className="absolute top-0 left-0 w-full h-full pointer-events-none bg-gradient-to-b from-transparent to-slate-955/10 opacity-40 z-10" />
              
              {logs.length === 0 ? (
                <div className="text-slate-600 h-full flex items-center justify-center italic text-center text-[11px]">
                  Pending deployment transaction events...
                </div>
              ) : (
                <div className="space-y-3 select-text">
                  {logs.map((log) => (
                    <div key={log.id} className="leading-relaxed border-b border-slate-900 pb-2">
                      <div className="flex items-center justify-between text-[9px] text-slate-600 font-semibold">
                        <span>[ {log.timestamp} ]</span>
                        <span className={`uppercase tracking-wider font-extrabold ${
                          log.type === 'success' ? 'text-emerald-500' :
                          log.type === 'error' ? 'text-rose-500' : 'text-orange-400'
                        }`}>
                          {log.type}
                        </span>
                      </div>
                      
                      <div className="flex items-start gap-1 mt-1 font-mono text-[11px]">
                        <CornerDownRight className="w-3.5 h-3.5 shrink-0 text-slate-700 mt-0.5" />
                        <span className={`break-words ${
                          log.type === 'success' ? 'text-emerald-400' :
                          log.type === 'error' ? 'text-rose-400' : 'text-slate-300'
                        }`}>
                          {log.message}
                        </span>
                      </div>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 text-[10px] text-slate-500 leading-relaxed font-mono">
              <p>System node connected successfully.</p>
              <p className="mt-0.5">Ready to execute git/blobs post requests atomically.</p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer id="portal-footer" className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-2">
          <p>© 2026 KaiOS Developer Store Registry. Built with high-fidelity React.</p>
          <div className="flex items-center gap-3">
            <a 
              href="https://github.com/Chijioke12/Open-KaiStore-Registry" 
              target="_blank" 
              rel="noreferrer" 
              className="flex items-center gap-1 hover:text-orange-400 transition"
            >
              <Github className="w-3.5 h-3.5" />
              Default Registry Database
            </a>
          </div>
        </div>
      </footer>

      {/* Custom Dialog Alert Overlay */}
      {modalAlert.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl relative space-y-4">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-full shrink-0 ${
                modalAlert.type === 'success' ? 'bg-emerald-950 text-emerald-400 border border-emerald-850' :
                modalAlert.type === 'error' ? 'bg-rose-950 text-rose-400 border border-rose-850' :
                'bg-blue-950 text-blue-400 border border-blue-850'
              }`}>
                {modalAlert.type === 'success' ? <CheckCircle className="w-5 h-5" /> :
                 modalAlert.type === 'error' ? <AlertCircle className="w-5 h-5" /> :
                 <Info className="w-5 h-5" />}
              </div>
              <div className="space-y-1">
                <h3 className="text-sm sm:text-base font-bold text-white">{modalAlert.title}</h3>
                <p className="text-xs sm:text-sm text-slate-300 whitespace-pre-line leading-relaxed">{modalAlert.message}</p>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setModalAlert((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs sm:text-sm font-semibold rounded-lg border border-slate-705 transition cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Dialog Confirm Overlay */}
      {modalConfirm.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl relative space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-amber-950 text-amber-400 border border-amber-850 shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm sm:text-base font-bold text-white">{modalConfirm.title}</h3>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{modalConfirm.message}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setModalConfirm((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-755 text-slate-300 text-xs sm:text-sm font-semibold rounded-lg border border-slate-700 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setModalConfirm((prev) => ({ ...prev, isOpen: false }));
                  if (modalConfirm.onConfirm) modalConfirm.onConfirm();
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs sm:text-sm font-bold rounded-lg transition active:scale-95 cursor-pointer"
              >
                Proceed
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
