# Portfolio Balancer

A small calculator for investing deposits in Israeli shekels. Enter the current value and target percentage of each holding, plus your deposit. It suggests how to distribute the new money without selling, and compares current, projected and target allocations.

## Use

The initial figures are a clearly marked example. Replace them with your own names, current market values, targets and deposit. Targets must total exactly 100%. Values support two decimal places. A 0% target retains an existing holding without directing new money to it.

Everything runs in your browser. Entries are stored in localStorage on this device, never sent to a server. Other devices and browsers keep separate data. Clearing browser site data removes saved entries. No account, API keys, market feed or external dependencies are required.

## How allocation works

The calculator funds the most underweight holdings relative to their targets first. Once holdings have the same current-value-to-target ratio, new money is distributed between them proportionally to their targets. Holdings above the resulting level receive zero. This is a weighted water-filling algorithm: final values are `max(current value, level × target weight)`, with the level chosen so purchases sum to the deposit. Zero-target holdings are excluded from purchases.

With sufficient new money, the final mix reaches the requested targets. With smaller deposits, some overweight holdings can remain above target. This calculation does not suggest selling. Integer agorot and largest-remainder rounding ensure that purchases always sum to the exact deposit. Displayed percentage gaps are percentage points, abbreviated “pp.” Prices, trading fees, currency conversion and minimum/whole-share purchases are outside the calculation.

## Local development

Requires Node.js 18 or newer. No installation or build step.

```sh
node server.js
node --test
```

Open http://127.0.0.1:4173. Serve over HTTP because the calculator uses JavaScript modules.

## Deploy to GitHub Pages

Push the files to a GitHub repository. Under **Settings → Pages → Build and deployment**, choose **Deploy from a branch**, then **main** and **/(root)**. Save. The `.nojekyll` file enables direct static hosting; no build workflow is required.

The application uses relative asset paths and works under a project URL such as `https://USERNAME.github.io/portfolio-balancer/`.

See [GitHub’s publishing-source documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
