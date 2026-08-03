const { execSync } = require("child_process");
const path = require("path");

process.env.ComSpec = 'C:\\Windows\\system32\\cmd.exe';

function pushRepo(repoDir, repoName) {
  console.log(`=======================================================`);
  console.log(`🚀 PUSHING REPOSITORY: ${repoName}`);
  console.log(`Directory: ${repoDir}`);
  console.log(`=======================================================\n`);

  try {
    // Check current branch
    const branch = execSync('git branch --show-current', { cwd: repoDir, encoding: "utf8" }).trim();
    console.log(`Current Branch: ${branch}`);

    if (branch !== "vasu-deva") {
      console.log(`Switching / Creating branch 'vasu-deva'...`);
      try {
        execSync('git checkout vasu-deva', { cwd: repoDir, encoding: "utf8" });
      } catch {
        execSync('git checkout -b vasu-deva', { cwd: repoDir, encoding: "utf8" });
      }
    }

    console.log(`Staging all files...`);
    execSync('git add .', { cwd: repoDir, encoding: "utf8" });

    const status = execSync('git status --porcelain', { cwd: repoDir, encoding: "utf8" }).trim();
    if (status) {
      console.log(`Committing changes...`);
      execSync('git commit -m "feat(tax-services): complete Tax microservices implementation, API gateway wiring, UI pages, and test runners"', { cwd: repoDir, encoding: "utf8" });
    } else {
      console.log(`No uncommitted changes in working tree.`);
    }

    console.log(`Pushing to remote branch 'vasu-deva'...`);
    const pushOut = execSync('git push -u origin vasu-deva', { cwd: repoDir, encoding: "utf8" });
    console.log(pushOut);
    console.log(`✅ ${repoName} successfully pushed to branch vasu-deva!`);
  } catch (err) {
    console.error(`❌ Error pushing ${repoName}:`, err.stdout || err.stderr || err.message);
  }
  console.log(`-------------------------------------------------------\n`);
}

const frontendPath = path.join(__dirname, "..");
const backendPath = "c:\\Users\\Dell\\Downloads\\Audit_Event_Store\\zoiko-suite project\\zoiko-suite";

pushRepo(frontendPath, "Frontend Platform (zoiko-suite-frontend-platform)");
pushRepo(backendPath, "Backend Suite (zoiko-suite)");
