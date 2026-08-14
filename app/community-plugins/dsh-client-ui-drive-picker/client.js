window.__ModuleLoader__.load({
  id: '@dsh-community/dsh-client-ui-drive-picker',
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    const React = require('react');
    const { jsx, jsxs } = require('react/jsx-runtime');
    const { Button, Modal } = require('@deepseek-ai/dsh-client-ui-primitives');

    const LOCALE_NS = 'community-drive-picker';
    const inject = ['slots', 'workspaces', 'locale'];
    const DRIVE_LETTERS = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const STYLE_ID = 'dsh-community-drive-picker-style';
    const STYLE_TEXT = `
      .dshCommunityDrivePicker{gap:0;width:min(720px,100%);height:min(560px,100dvh - 32px);padding:0}
      .dshCommunityDrivePickerHeader{border-bottom:1px solid var(--dsw-alias-border-l3);padding:20px 24px 16px}
      .dshCommunityDrivePickerTitle{margin:0;color:var(--dsw-alias-label-primary);font-size:16px;line-height:24px}
      .dshCommunityDrivePickerPath{display:flex;gap:4px;align-items:center;min-height:32px;margin-top:10px}
      .dshCommunityDrivePickerPathText{overflow:hidden;flex:1;white-space:nowrap;text-overflow:ellipsis;color:var(--dsw-alias-label-secondary);font-size:13px}
      .dshCommunityDrivePickerPathEdit{box-sizing:border-box;width:100%;height:34px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);padding:0 9px;font:inherit;font-size:13px}
      .dshCommunityDrivePickerCrumbs{display:flex;gap:4px;align-items:center;min-width:0;overflow-x:auto}
      .dshCommunityDrivePickerCrumb{border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;padding:2px 4px;font:inherit;font-size:13px}
      .dshCommunityDrivePickerCrumb:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);border-radius:5px}
      .dshCommunityDrivePickerDrives{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
      .dshCommunityDrivePickerDrive{min-width:56px;height:34px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;font-size:13px}
      .dshCommunityDrivePickerDrive:hover,.dshCommunityDrivePickerDrive[aria-current=true]{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-interactive-bg-hover)}
      .dshCommunityDrivePickerContent{display:flex;flex:1;min-height:0;padding:12px 16px 16px 24px;overflow:hidden}
      .dshCommunityDrivePickerFolders{display:flex;flex:1;flex-direction:column;gap:2px;min-width:0;overflow-y:auto;padding-right:8px}
      .dshCommunityDrivePickerFolder{display:flex;align-items:center;min-height:34px;width:100%;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;text-align:left;padding:0 8px;font:inherit;font-size:13px}
      .dshCommunityDrivePickerFolder:hover{background:var(--dsw-alias-interactive-bg-hover)}
      .dshCommunityDrivePickerFolderName{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
      .dshCommunityDrivePickerMuted,.dshCommunityDrivePickerError{padding:8px;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}
      .dshCommunityDrivePickerError{color:var(--dsw-alias-state-error-primary)}
      .dshCommunityDrivePickerFooter{display:flex;align-items:center;gap:8px;border-top:1px solid var(--dsw-alias-border-l3);padding:16px 24px}
      .dshCommunityDrivePickerSpacer{flex:1}
      .dshCommunityDrivePickerNewFolder{display:flex;gap:8px;margin:0 24px 16px}
      .dshCommunityDrivePickerNewFolder input{box-sizing:border-box;min-width:0;height:34px;flex:1;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);padding:0 9px;font:inherit;font-size:13px}
      @media (prefers-reduced-motion:reduce){.dshCommunityDrivePicker *{scroll-behavior:auto}}
    `;

    function ensureStyles() {
      if (typeof document === 'undefined' || document.getElementById(STYLE_ID) !== null) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = STYLE_TEXT;
      document.head.appendChild(style);
    }

    function isWindowsListing(listing) {
      return Boolean(listing?.home?.includes('\\'));
    }

    function driveCandidates(listing) {
      if (!isWindowsListing(listing)) return [];
      return DRIVE_LETTERS.map((letter) => `${letter}:\\`);
    }

    function formatError(error) {
      return error instanceof Error ? error.message : String(error);
    }

    function DriveDirectoryBrowser({ open, busy, listDirectory, createDirectory, t, onOpen, onClose }) {
      const [listing, setListing] = React.useState(null);
      const [drives, setDrives] = React.useState([]);
      const [loading, setLoading] = React.useState(false);
      const [probingDrives, setProbingDrives] = React.useState(false);
      const [error, setError] = React.useState(null);
      const [pathDraft, setPathDraft] = React.useState('');
      const [editingPath, setEditingPath] = React.useState(false);
      const [showHidden, setShowHidden] = React.useState(false);
      const [newFolderName, setNewFolderName] = React.useState(null);
      const [creatingFolder, setCreatingFolder] = React.useState(false);
      const [newFolderError, setNewFolderError] = React.useState(null);
      const requestRef = React.useRef(0);

      const navigate = React.useCallback((path) => {
        const request = ++requestRef.current;
        setLoading(true);
        setError(null);
        listDirectory(path).then((nextListing) => {
          if (request !== requestRef.current) return;
          setListing(nextListing);
          setPathDraft(nextListing.path);
          setEditingPath(false);
          setLoading(false);
        }, (reason) => {
          if (request !== requestRef.current) return;
          setError(formatError(reason));
          setLoading(false);
        });
      }, [listDirectory]);

      React.useEffect(() => {
        ensureStyles();
      }, []);

      React.useEffect(() => {
        if (!open) {
          requestRef.current += 1;
          setListing(null);
          setDrives([]);
          setLoading(false);
          setProbingDrives(false);
          setError(null);
          setEditingPath(false);
          setNewFolderName(null);
          return undefined;
        }

        const controller = new AbortController();
        let active = true;
        setLoading(true);
        setError(null);
        setDrives([]);
        listDirectory(undefined, controller.signal).then((initialListing) => {
          if (!active) return;
          setListing(initialListing);
          setPathDraft(initialListing.path);
          setLoading(false);
          if (!isWindowsListing(initialListing)) return;

          setProbingDrives(true);
          const discovered = new Map();
          const probe = driveCandidates(initialListing).map((path) => listDirectory(path, controller.signal).then((driveListing) => {
            if (!active) return;
            discovered.set(driveListing.path.toUpperCase(), driveListing.path);
            setDrives([...discovered.values()].sort());
          }).catch(() => undefined));
          Promise.allSettled(probe).then(() => {
            if (active) setProbingDrives(false);
          });
        }, (reason) => {
          if (!active) return;
          setError(formatError(reason));
          setLoading(false);
        });
        return () => {
          active = false;
          controller.abort();
        };
      }, [open, listDirectory]);

      if (!open) return null;

      const disabled = busy || loading || creatingFolder;
      const visibleEntries = (listing?.entries ?? []).filter((entry) => showHidden || !entry.hidden);
      const currentPath = listing?.path ?? '';
      const canOpen = currentPath !== '' && !disabled && !editingPath && newFolderName === null;
      const commitPath = () => {
        if (pathDraft.trim() !== '') navigate(pathDraft.trim());
      };
      const createFolder = () => {
        if (listing === null || newFolderName === null || newFolderName.trim() === '') return;
        setCreatingFolder(true);
        setNewFolderError(null);
        createDirectory(listing.path, newFolderName.trim()).then(() => {
          setCreatingFolder(false);
          setNewFolderName(null);
          navigate(listing.path);
        }, (reason) => {
          setCreatingFolder(false);
          setNewFolderError(formatError(reason));
        });
      };

      return jsxs(Modal, {
        open,
        onClose: () => {
          if (!disabled && newFolderName === null) onClose();
        },
        title: t('drivePicker.title'),
        className: 'dshCommunityDrivePicker',
        headless: true,
        children: [
          jsxs('div', {
            className: 'dshCommunityDrivePickerHeader',
            children: [
              jsx('h2', { className: 'dshCommunityDrivePickerTitle', children: t('drivePicker.title') }),
              editingPath
                ? jsx('input', {
                    className: 'dshCommunityDrivePickerPathEdit',
                    value: pathDraft,
                    autoFocus: true,
                    disabled,
                    'aria-label': t('drivePicker.editPath'),
                    onChange: (event) => setPathDraft(event.target.value),
                    onKeyDown: (event) => {
                      if (event.key === 'Enter') commitPath();
                      if (event.key === 'Escape') {
                        setPathDraft(currentPath);
                        setEditingPath(false);
                      }
                    },
                  })
                : jsxs('div', {
                    className: 'dshCommunityDrivePickerPath',
                    children: [
                      jsx('nav', {
                        className: 'dshCommunityDrivePickerCrumbs',
                        'aria-label': t('drivePicker.path'),
                        children: (listing?.crumbs ?? []).map((crumb) => jsx('button', {
                          type: 'button',
                          className: 'dshCommunityDrivePickerCrumb',
                          disabled,
                          onClick: () => navigate(crumb.path),
                          children: crumb.name,
                        }, crumb.path)),
                      }),
                      jsx('button', {
                        type: 'button',
                        className: 'dshCommunityDrivePickerCrumb',
                        disabled,
                        onClick: () => setEditingPath(true),
                        children: t('drivePicker.editPath'),
                      }),
                    ],
                  }),
              isWindowsListing(listing) && jsxs('div', {
                className: 'dshCommunityDrivePickerDrives',
                role: 'group',
                'aria-label': t('drivePicker.drives'),
                children: [
                  ...drives.map((drive) => jsx('button', {
                    type: 'button',
                    className: 'dshCommunityDrivePickerDrive',
                    disabled,
                    'aria-current': currentPath.toUpperCase() === drive.toUpperCase(),
                    onClick: () => navigate(drive),
                    children: drive.slice(0, 2),
                  }, drive)),
                  probingDrives && jsx('span', { className: 'dshCommunityDrivePickerMuted', children: t('drivePicker.probingDrives') }),
                ],
              }),
            ],
          }),
          jsxs('div', {
            className: 'dshCommunityDrivePickerContent',
            children: [
              jsx('div', {
                className: 'dshCommunityDrivePickerFolders',
                children: loading
                  ? jsx('div', { className: 'dshCommunityDrivePickerMuted', role: 'status', children: t('drivePicker.loading') })
                  : visibleEntries.length > 0
                    ? visibleEntries.map((entry) => jsx('button', {
                        type: 'button',
                        className: 'dshCommunityDrivePickerFolder',
                        disabled: disabled || editingPath || newFolderName !== null,
                        onClick: () => navigate(entry.path),
                        children: jsx('span', { className: 'dshCommunityDrivePickerFolderName', children: entry.name }),
                      }, entry.path))
                    : jsx('div', { className: 'dshCommunityDrivePickerMuted', children: t('drivePicker.empty') }),
              }),
              error !== null && jsx('div', { className: 'dshCommunityDrivePickerError', role: 'alert', children: error }),
            ],
          }),
          newFolderName !== null && jsxs('div', {
            className: 'dshCommunityDrivePickerNewFolder',
            children: [
              jsx('input', {
                value: newFolderName,
                autoFocus: true,
                disabled: creatingFolder,
                placeholder: t('drivePicker.folderName'),
                'aria-label': t('drivePicker.folderName'),
                onChange: (event) => setNewFolderName(event.target.value),
                onKeyDown: (event) => {
                  if (event.key === 'Enter') createFolder();
                  if (event.key === 'Escape' && !creatingFolder) setNewFolderName(null);
                },
              }),
              jsx(Button, { variant: 'outline', disabled: creatingFolder, onClick: () => setNewFolderName(null), children: t('drivePicker.cancel') }),
              jsx(Button, { variant: 'primary', disabled: creatingFolder || newFolderName.trim() === '', onClick: createFolder, children: t('drivePicker.create') }),
              newFolderError !== null && jsx('div', { className: 'dshCommunityDrivePickerError', role: 'alert', children: newFolderError }),
            ],
          }),
          jsxs('div', {
            className: 'dshCommunityDrivePickerFooter',
            children: [
              jsx(Button, {
                variant: 'outline',
                disabled: disabled || listing === null || editingPath || newFolderName !== null,
                onClick: () => {
                  setNewFolderName('');
                  setNewFolderError(null);
                },
                children: t('drivePicker.newFolder'),
              }),
              jsx('button', {
                type: 'button',
                className: 'dshCommunityDrivePickerCrumb',
                disabled: disabled || editingPath || newFolderName !== null,
                'aria-pressed': showHidden,
                onClick: () => setShowHidden((value) => !value),
                children: t('drivePicker.showHidden'),
              }),
              jsx('span', { className: 'dshCommunityDrivePickerSpacer' }),
              jsx(Button, { variant: 'outline', disabled: disabled || newFolderName !== null, onClick: onClose, children: t('drivePicker.cancel') }),
              jsx(Button, { variant: 'primary', disabled: !canOpen, onClick: () => onOpen(currentPath), children: t('drivePicker.open') }),
            ],
          }),
        ],
      });
    }

    function DriveDirectoryFlow(props) {
      return React.createElement(DriveDirectoryBrowser, {
        open: props.open,
        busy: props.busy,
        listDirectory: props.listDirectory,
        createDirectory: props.createDirectory,
        t: props.t,
        onOpen: props.onPicked,
        onClose: props.onCancel,
      });
    }

    function apply(ctx) {
      ctx.effect(() => {
        const disposers = [];
        const dictionaries = [
          ['zh', {
            'drivePicker.title': '选择工作区目录',
            'drivePicker.path': '当前路径',
            'drivePicker.editPath': '输入路径',
            'drivePicker.drives': '可用磁盘',
            'drivePicker.probingDrives': '正在检测磁盘…',
            'drivePicker.loading': '加载中…',
            'drivePicker.empty': '此目录没有可浏览的文件夹。',
            'drivePicker.newFolder': '新建文件夹',
            'drivePicker.folderName': '文件夹名称',
            'drivePicker.create': '创建',
            'drivePicker.cancel': '取消',
            'drivePicker.open': '选择当前文件夹',
            'drivePicker.showHidden': '显示隐藏文件',
          }],
          ['en', {
            'drivePicker.title': 'Select Workspace Directory',
            'drivePicker.path': 'Current path',
            'drivePicker.editPath': 'Enter path',
            'drivePicker.drives': 'Available drives',
            'drivePicker.probingDrives': 'Detecting drives…',
            'drivePicker.loading': 'Loading…',
            'drivePicker.empty': 'No folders are available in this directory.',
            'drivePicker.newFolder': 'New folder',
            'drivePicker.folderName': 'Folder name',
            'drivePicker.create': 'Create',
            'drivePicker.cancel': 'Cancel',
            'drivePicker.open': 'Select current folder',
            'drivePicker.showHidden': 'Show hidden files',
          }],
        ];
        try {
          for (const [locale, dictionary] of dictionaries) disposers.push(ctx.locale.register(LOCALE_NS, locale, dictionary));
        } catch (error) {
          for (const dispose of disposers.reverse()) dispose();
          throw error;
        }
        return () => {
          for (const dispose of disposers) dispose();
        };
      }, 'community-drive-picker: dictionaries');

      const injected = () => ({
        listDirectory: (path, signal) => ctx.workspaces.listDirectory(path, signal),
        createDirectory: (path, name) => ctx.workspaces.createDirectory(path, name),
        t: ctx.locale.bind(LOCALE_NS),
      });
      ctx.slots.inject('conversation.hero.workspace.directoryFlow', () => ctx.slots.inject('sidebar.workspaces.directoryFlow', function* () {
        yield ctx.slots.register({ name: 'conversation.hero.workspace.directoryFlow', inject: injected }, DriveDirectoryFlow);
        yield ctx.slots.register({ name: 'sidebar.workspaces.directoryFlow', inject: injected }, DriveDirectoryFlow);
      }));
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.driveCandidates = driveCandidates;
    return module.exports;
  },
});
