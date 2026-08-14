# Third-Party Notices

This repository is an unofficial community launcher. It is not affiliated with,
endorsed by, or supported by DeepSeek or Microsoft.

The portable ZIP bundles third-party runtime components. Their copyright and
license terms remain in force. `LICENSE` covers only the launcher code and
documentation in this repository, not these components.

## DeepSeek Harness

The distribution includes `@deepseek-ai/dsh` version pinned in
`config/runtime-manifest.json`.

Copyright (c) 2026 DeepSeek

DeepSeek Harness is distributed under the MIT License:

> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions: The above copyright
> notice and this permission notice shall be included in all copies or
> substantial portions of the Software.

Source, complete license, and upstream notices:
<https://github.com/deepseek-ai/deepseek-harness>

## Node.js

The distribution bundles the Windows x64 Node.js archive identified in
`config/runtime-manifest.json`. Its license and notices are included in the ZIP
at `runtime/node/LICENSE`.

Source: <https://github.com/nodejs/node>

## PowerShell

The distribution bundles the Windows x64 PowerShell archive identified in
`config/runtime-manifest.json`. PowerShell is MIT licensed; its bundled license
is included in the ZIP at `runtime/pwsh/LICENSE.txt`.

Source: <https://github.com/PowerShell/PowerShell>

## npm dependency closure

The exact npm dependency closure is locked in `app/package-lock.json`. Package
license metadata and any license files published by those packages remain with
the installed dependency tree in `app/node_modules`. This notice is an index,
not a replacement for individual third-party license texts.
