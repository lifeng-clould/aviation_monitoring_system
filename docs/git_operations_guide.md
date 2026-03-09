# Git 操作学习笔记

整理自前面的问答，覆盖版本标记、拉取方式和标签管理，便于之后回顾。

## 1. 给“原版”打上版本标识

- **轻量方式**：在仓库根目录创建 `VERSION` 文件，写入当前版本号（如 `v0.1.0`）。后续每次阶段性更新只需修改该文件即可。
- **README 提示**：在 `README.md` 顶部加一句 “当前版本：v0.1.0（原始竞赛提交）”，方便他人查看。
- **正式方式**：若项目未来包装成模块，可在 `pyproject.toml`/`setup.cfg` 里同步维护 `version` 字段，但对当前脚本项目不是必需。

## 2. 拉取远端最新代码

```bash
git fetch origin
git pull origin main      # 若默认分支不是 main，请替换为实际名字
```

- 如果本地有未提交的修改，先 `git status` 检查，必要时 `git stash`／临时提交，避免冲突。
- `git pull` 等同于 `fetch + merge`，只想获取不合并可以只做 `git fetch`。

## 3. 获取“原版”代码的几种方式

1. **重新克隆**（最安全）  
   ```bash
   git clone https://github.com/<user>/<repo>.git repo-original
   ```
   在新目录中得到远端原始版本，不影响当前工作。

2. **本地新建分支指向远端**  
   ```bash
   git fetch origin
   git checkout -b original-clean origin/main
   ```
   这样 `original-clean` 分支就是 GitHub 上的原版，当前工作可在其他分支继续进行。

3. **强制回退到远端**（会丢本地未提交修改，谨慎使用）  
   ```bash
   git fetch origin
   git reset --hard origin/main
   ```

## 4. 拉取特定版本

- **按提交哈希**  
  ```bash
  git fetch origin
  git checkout <commit_sha>
  # 如果要在此基础上继续开发
  git checkout -b feature-based-on-old <commit_sha>
  ```

- **按标签**  
  ```bash
  git fetch origin --tags
  git checkout tags/v0.1.0            # 进入 detatched HEAD 查看
  git checkout -b restore-v0.1.0 tags/v0.1.0   # 若要继续开发
  ```

- 另外还可用相对引用（如 `HEAD~3`）或按日期筛选提交，核心都是 `git checkout <对象>`。

## 5. 打标签（Tag）

1. **创建标签**  
   - 轻量标签：`git tag v0.1.0`  
   - 附注标签（推荐，含注释）：`git tag -a v0.1.0 -m "原始竞赛版本"`
   - 若要标记历史提交：`git tag -a v0.1.0 <commit_sha> -m "说明"`

2. **推送到远端**  
   ```bash
   git push origin v0.1.0        # 只推一个
   git push origin --tags        # 推送所有本地新标签
   ```

3. **查看与验证**  
   - 本地：`git tag -n` 或 `git show v0.1.0`
   - 远端：GitHub “Tags/Releases” 页面。

## 6. 使用标签恢复或拉取原版

- 当你确认“原版”已经被标记（例如 `v0.1.0`），后续需要回到该状态时：
  ```bash
  git fetch origin --tags
  git checkout v0.1.0                 # 查看
  # 或在此基础上建新分支继续开发
  git checkout -b hotfix-from-v0.1.0 v0.1.0
  ```

- 这种方式比手动找提交更稳：只要标签存在，就可反复拉到同一版本。

## 7. 常见注意事项

- `git checkout` 切到标签或旧提交时，默认是“detached HEAD”，修改不会落在任何分支上；若要继续开发，立刻 `git checkout -b 新分支名`。
- 打标签前确保工作区干净，尤其当你想代表“原版”或里程碑状态时。
- 在多人协作中，务必先推送标签再告知队友，否则别人无法直接 `checkout v0.x`。
- 若使用 `git stash` 暂存本地改动，记得适时 `git stash pop`，避免遗漏。

掌握上述操作后，就可以按需标记、回退、拉取任意版本，项目演示或恢复都更稳妥。祝使用顺利！

