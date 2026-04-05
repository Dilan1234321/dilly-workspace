import sys
import os

# Redirect all "projects.dilly.X" imports to the repo root equivalents.
# e.g. "projects.dilly.api.routers.auth" -> "api.routers.auth"
#      "projects.dilly.dilly_resume_auditor" -> "dilly_resume_auditor"

_here = os.path.dirname(os.path.abspath(__file__))
_repo_root = os.path.normpath(os.path.join(_here, '..', '..'))
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)


class _DillyRedirector:
    _PREFIX = 'projects.dilly.'

    def find_module(self, fullname, path=None):
        if fullname.startswith(self._PREFIX):
            return self
        return None

    def load_module(self, fullname):
        if fullname in sys.modules:
            return sys.modules[fullname]
        suffix = fullname[len(self._PREFIX):]
        import importlib
        real_mod = importlib.import_module(suffix)
        sys.modules[fullname] = real_mod
        return real_mod


sys.meta_path.insert(0, _DillyRedirector())
