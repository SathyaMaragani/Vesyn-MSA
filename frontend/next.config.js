/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  webpack: (config, { webpack }) => {
    // paper.js (a Ketcher dependency) requires two Node-only helpers behind runtime guards
    // (`if (paper.agent.node)`, `self || require(...)`) that a browser never reaches. Leave them out.
    config.plugins.push(
      new webpack.IgnorePlugin({ resourceRegExp: /^\.\/node\/(extend|self)\.js$/, contextRegExp: /[\\/]paper[\\/]dist$/ }),
    );
    return config;
  },
};

module.exports = nextConfig;
