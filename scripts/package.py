import os
import zipfile
import tarfile

EXCLUDED_DIRS = {
    "node_modules",
    ".output",
    ".git",
    ".wrangler",
    ".lovable",
    ".gemini",
    "scratch"
}

EXCLUDED_FILES = {
    "bun.lock",
    "bunfig.toml",
    "app.zip",
    "app.tar.gz",
    "deploy_source.tar.gz",
    ".env",
    ".env.local"
}

def is_excluded(path):
    parts = os.path.normpath(path).split(os.sep)
    for p in parts:
        if p in EXCLUDED_DIRS or p.startswith(".env"):
            return True
    return False

def make_zip(out_zip_path):
    print(f"Creating {out_zip_path} with UNIX POSIX permissions (644 files / 755 dirs)...")
    with zipfile.ZipFile(out_zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk("."):
            dirs[:] = [d for d in dirs if not is_excluded(os.path.join(root, d))]
            for d in dirs:
                dir_path = os.path.relpath(os.path.join(root, d), ".").replace("\\", "/") + "/"
                zinfo = zipfile.ZipInfo(dir_path)
                zinfo.create_system = 3  # UNIX
                zinfo.external_attr = (0o755 | 0o040000) << 16  # S_IFDIR | 0755
                zf.writestr(zinfo, "")

            for f in files:
                if f in EXCLUDED_FILES or f.startswith(".env") or f.endswith(".zip") or f.endswith(".tar.gz"):
                    continue
                file_path = os.path.join(root, f)
                arc_name = os.path.relpath(file_path, ".").replace("\\", "/")
                with open(file_path, "rb") as fp:
                    data = fp.read()
                zinfo = zipfile.ZipInfo(arc_name)
                zinfo.create_system = 3  # UNIX
                zinfo.external_attr = (0o644 | 0o100000) << 16  # S_IFREG | 0644
                zf.writestr(zinfo, data)
    print(f"Created {out_zip_path} successfully!")

def make_tar(out_tar_path):
    print(f"Creating {out_tar_path} with UNIX POSIX permissions...")
    with tarfile.open(out_tar_path, "w:gz") as tar:
        for root, dirs, files in os.walk("."):
            dirs[:] = [d for d in dirs if not is_excluded(os.path.join(root, d))]
            for d in dirs:
                dir_path = os.path.join(root, d)
                arc_name = os.path.relpath(dir_path, ".").replace("\\", "/")
                tinfo = tar.gettarinfo(dir_path, arcname=arc_name)
                tinfo.mode = 0o755
                tinfo.uid = 1000
                tinfo.gid = 1000
                tinfo.uname = "node"
                tinfo.gname = "node"
                tar.addfile(tinfo)

            for f in files:
                if f in EXCLUDED_FILES or f.startswith(".env") or f.endswith(".zip") or f.endswith(".tar.gz"):
                    continue
                file_path = os.path.join(root, f)
                arc_name = os.path.relpath(file_path, ".").replace("\\", "/")
                tinfo = tar.gettarinfo(file_path, arcname=arc_name)
                tinfo.mode = 0o644
                tinfo.uid = 1000
                tinfo.gid = 1000
                tinfo.uname = "node"
                tinfo.gname = "node"
                with open(file_path, "rb") as fp:
                    tar.addfile(tinfo, fp)
    print(f"Created {out_tar_path} successfully!")

if __name__ == "__main__":
    make_zip("app.zip")
    make_tar("app.tar.gz")
