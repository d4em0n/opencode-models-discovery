# CLIProxy metadata fork

This fork of [yuhp/opencode-models-discovery](https://github.com/yuhp/opencode-models-discovery)
adds `modelInfoFormat: "cliproxy"` and optional V2 periodic refresh. It preserves the
upstream plugin ID, saved provider credentials, console and override APIs.

## Install

Download the prebuilt `.tgz` from the [fork's releases](https://github.com/d4em0n/opencode-models-discovery/releases).
Remove your existing models-discovery plugin entry, extract the archive to a permanent
directory, and add its **`package/dist` directory** to `plugins` in your OpenCode config:

```jsonc
{
  "plugins": ["/absolute/path/to/extracted/package/dist"],
  "providers": {
    "gateway": {
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": {
        "baseURL": "https://gateway.example/v1",
        "modelsDiscovery": {
          "enabled": true,
          "modelInfoFormat": "cliproxy",
          "refreshIntervalMs": 300000,
          "cache": { "enabled": false }
        }
      }
    }
  }
}
```

Keep your existing provider ID to reuse saved credentials. New connections can use
OpenCode `/connect`; do not copy API keys into a repository. Restart OpenCode after
switching the plugin build. On Windows use a forward-slash path such as
`C:/Users/you/Tools/models-discovery/package/dist`. Windows installation is unverified.

## Behavior

The plugin discovers membership through the ordinary model endpoint, then requests
the authenticated enhanced catalog (`models?client_version=opencode-models-discovery`).
It uses exact model IDs to apply advertised effort variants, deployment context/output
limits and input modalities. No Python importer or static model list is needed.

Startup, manual refresh, and periodic refresh rebuild metadata. Explicit model config
and saved overrides retain priority; remove old metadata overrides in
`/models-discovery-console` so they do not mask gateway updates. The configured interval
refreshes all enabled providers in that plugin location; the shortest interval wins.

Missing gateway fields remain unknown or use normal defaults (output defaults to
32000 tokens, bounded by context). Metadata fetch failures retain the previous V2
inventory. See the [field mapping](configuration.md#cliproxyapi).

## Build from source

Check out `feat/cliproxy-metadata`, run `npm ci`, then `npm run build:release` with
Bun available in `PATH`. Point OpenCode at the resulting `dist` directory. The initial
release was checked on OpenCode 2.0.22 with isolated live inference and a mock gateway
whose context, effort list and membership changed without a manual refresh.
