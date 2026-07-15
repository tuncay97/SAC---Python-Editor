(function () {
  "use strict";

  var DEFAULT_PYTHON_CODE = [
    "# 'df' değişkeni pandas DataFrame olarak hazır gelir (getResultSet() çıktısından türetilmiştir,",
    "# her kolon = bir boyut/ölçü id'si, değer = rawValue).",
    "# 'df_raw' ise getResultSet()'in ham (id/description/rawValue/parentId içeren) halidir.",
    "#",
    "# Bu script'in SONUNDA bir 'result' değişkeni tanımlamalısınız: DataFrame ya da liste-of-dict.",
    "",
    "result = df.copy()",
    "# Örnek: result['Toplam'] = pd.to_numeric(result['Miktar'], errors='coerce') * 1.2",
  ].join("\n");

  var SAMPLE_RESULT_SET = JSON.stringify([
    {
      Account_1: { id: "[Account].[Sales]", description: "Satis", rawValue: "1000" },
      Location_1: { id: "[Location].[IST]", description: "Istanbul", rawValue: "" },
    },
    {
      Account_1: { id: "[Account].[Sales]", description: "Satis", rawValue: "1500" },
      Location_1: { id: "[Location].[ANK]", description: "Ankara", rawValue: "" },
    },
  ]);

  var TEMPLATE = document.createElement("template");
  TEMPLATE.innerHTML =
    "<style>" +
    ':host { display:block; font-family: "72", Arial, sans-serif; box-sizing:border-box; height:100%; }' +
    ".wrap { display:flex; flex-direction:column; height:100%; border:1px solid #d9d9d9; border-radius:6px; overflow:hidden; background:#fff; }" +
    ".toolbar { display:flex; align-items:center; gap:8px; padding:6px 10px; background:#f5f6f7; border-bottom:1px solid #d9d9d9; }" +
    ".title { font-weight:600; font-size:13px; color:#32363a; flex:1; }" +
    ".status { font-size:11px; padding:2px 8px; border-radius:10px; background:#eee; color:#555; }" +
    ".status.loading, .status.running { background:#fff3cd; color:#8a6116; }" +
    ".status.done { background:#e4f5e9; color:#1e7a34; }" +
    ".status.error { background:#fbe4e4; color:#a4262c; }" +
    "textarea { flex:1; width:100%; border:none; resize:none; font-family: Consolas, Menlo, monospace; font-size:12px; padding:8px; box-sizing:border-box; outline:none; min-height:80px; }" +
    ".actions { display:flex; gap:6px; padding:6px 10px; border-top:1px solid #d9d9d9; background:#fafafa; }" +
    "button { font-size:12px; padding:4px 10px; border:1px solid #b7b7b7; border-radius:4px; background:#fff; cursor:pointer; }" +
    "button.primary { background:#0a6ed1; border-color:#0a6ed1; color:#fff; }" +
    "button:disabled { opacity:0.5; cursor:not-allowed; }" +
    ".log { max-height:120px; overflow:auto; font-family:Consolas, Menlo, monospace; font-size:11px; padding:6px 10px; background:#1e1e1e; color:#d4d4d4; white-space:pre-wrap; }" +
    "</style>" +
    '<div class="wrap">' +
    '  <div class="toolbar">' +
    '    <span class="title">Python Engine</span>' +
    '    <span class="status" id="status">idle</span>' +
    "  </div>" +
    '  <textarea id="code" spellcheck="false"></textarea>' +
    '  <div class="actions">' +
    '    <button id="btnSave">Kodu Kaydet</button>' +
    '    <button id="btnTest">Örnek Veriyle Test Et</button>' +
    '  </div>' +
    '  <div class="log" id="log">Hazır. Kodu yazıp "Örnek Veriyle Test Et" ile deneyebilir, story\'den PythonEngine_1.run(...) ile de tetikleyebilirsiniz.</div>' +
    "</div>";

  class PythonEngine extends HTMLElement {
    constructor() {
      super();
      this._shadow = this.attachShadow({ mode: "open" });
      this._shadow.appendChild(TEMPLATE.content.cloneNode(true));

      this._props = {
        pythonCode: DEFAULT_PYTHON_CODE,
        pyodideVersion: "314.0.2",
      };
      this._status = "idle";
      this._lastResultJson = null;
      this._lastError = "";
      this._pyodide = null;
      this._pyodideLoadingPromise = null;

      this._el = {
        code: this._shadow.getElementById("code"),
        status: this._shadow.getElementById("status"),
        log: this._shadow.getElementById("log"),
        btnSave: this._shadow.getElementById("btnSave"),
        btnTest: this._shadow.getElementById("btnTest"),
      };

      this._el.code.value = this._props.pythonCode;
      this._el.btnSave.addEventListener("click", () => this._saveCode());
      this._el.btnTest.addEventListener("click", () => this.run(SAMPLE_RESULT_SET));
    }

    // ================= SAC Custom Widget lifecycle =================
    onCustomWidgetBeforeUpdate(changedProperties) {
      Object.assign(this._props, changedProperties);
    }

    onCustomWidgetAfterUpdate(changedProperties) {
      if (Object.prototype.hasOwnProperty.call(changedProperties, "pythonCode")) {
        this._el.code.value = this._props.pythonCode || "";
      }
    }

    connectedCallback() {
      // Pyodide bilinçli olarak burada YÜKLENMİYOR (lazy-load).
      // İlk run() çağrısında yüklenir; story açılışını yavaşlatmamak için.
    }

    // ================= Script API (widget.json "methods") =================
    run(resultSetJson) {
      var self = this;
      this._log("Çalıştırılıyor... (girdi: " + (resultSetJson ? resultSetJson.length : 0) + " karakter)");
      this._setStatus("loading");

      return this._ensurePyodide()
        .then(function () {
          self._setStatus("running");

          var flatRows = self._flattenResultSet(resultSetJson);
          var script = self._buildScript();

          self._pyodide.globals.set("input_data_json", JSON.stringify(flatRows));
          self._pyodide.globals.set("input_data_raw_json", resultSetJson || "[]");

          return self._pyodide.runPythonAsync(script);
        })
        .then(function (outputJson) {
          self._lastResultJson = outputJson;
          self._lastError = "";
          self._setStatus("done");
          self._log("Tamamlandı:\n" + outputJson);
          self.dispatchEvent(new CustomEvent("onRunComplete", { detail: { result: outputJson } }));
        })
        .catch(function (err) {
          self._lastError = String(err && err.message ? err.message : err);
          self._setStatus("error");
          self._log("HATA:\n" + self._lastError);
          self.dispatchEvent(new CustomEvent("onRunError", { detail: { message: self._lastError } }));
        });
    }

    getLastResult() {
      return this._lastResultJson || "[]";
    }

    getLastError() {
      return this._lastError || "";
    }

    getStatus() {
      return this._status;
    }

    getPythonCode() {
      return this._props.pythonCode;
    }

    setPythonCode(code) {
      this._props.pythonCode = code;
      this._el.code.value = code;
      this._notifyPropertiesChanged({ pythonCode: code });
    }

    // ================= Internal helpers =================
    _saveCode() {
      var code = this._el.code.value;
      this._props.pythonCode = code;
      this._notifyPropertiesChanged({ pythonCode: code });
      this._log("Kod kaydedildi (story ile birlikte saklanacak).");
    }

    _notifyPropertiesChanged(props) {
      this.dispatchEvent(
        new CustomEvent("propertiesChanged", { detail: { properties: props } })
      );
    }

    _setStatus(s) {
      this._status = s;
      this._el.status.textContent = s;
      this._el.status.className = "status " + s;
    }

    _log(msg) {
      this._el.log.textContent = msg;
    }

    // getResultSet() çıktısındaki {id, description, rawValue} yapısını
    // pandas için düz {kolon: değer} satırlarına indirger.
    _flattenResultSet(resultSetJson) {
      var rows = [];
      try {
        rows = JSON.parse(resultSetJson || "[]");
      } catch (e) {
        rows = [];
      }
      return rows.map(function (row) {
        var flat = {};
        Object.keys(row).forEach(function (key) {
          var cell = row[key];
          if (cell && typeof cell === "object") {
            flat[key] =
              cell.rawValue !== undefined && cell.rawValue !== "" ? cell.rawValue : cell.description;
          } else {
            flat[key] = cell;
          }
        });
        return flat;
      });
    }

    _buildScript() {
      var userCode = this._props.pythonCode || "result = df";
      return [
        "import json",
        "import pandas as pd",
        "import numpy as np",
        "",
        "_input_rows = json.loads(input_data_json)",
        "_input_rows_raw = json.loads(input_data_raw_json)",
        "df = pd.DataFrame(_input_rows)",
        "df_raw = _input_rows_raw  # ham getResultSet() çıktısı (id/description/rawValue ile)",
        "",
        "# ==== KULLANICI KODU BAŞLANGIÇ ====",
        userCode,
        "# ==== KULLANICI KODU BİTİŞ ====",
        "",
        "if 'result' not in dir():",
        "    raise NameError(\"Python kodu bir 'result' değişkeni tanımlamalıdır (DataFrame veya liste).\")",
        "",
        "if hasattr(result, 'to_dict'):",
        "    _output_json = json.dumps(result.to_dict(orient='records'), default=str)",
        "else:",
        "    _output_json = json.dumps(result, default=str)",
        "",
        "_output_json",
      ].join("\n");
    }

    _ensurePyodide() {
      var self = this;
      if (this._pyodide) return Promise.resolve(this._pyodide);
      if (this._pyodideLoadingPromise) return this._pyodideLoadingPromise;

      this._pyodideLoadingPromise = (function () {
        self._setStatus("loading");
        self._log("Pyodide çekirdeği yükleniyor...");

        var version = self._props.pyodideVersion || "314.0.2";
        var coreUrl = "https://cdnjs.cloudflare.com/ajax/libs/pyodide/" + version + "/pyodide.js";

        return self
          ._loadScriptOnce(coreUrl)
          .then(function () {
            // NOT: pyodide.js cdnjs'ten (npm mirror / "core" dağıtım) geliyor,
            // pandas/numpy gibi paket wheel'lerini barındırmıyor. Bu yüzden
            // indexURL'i jsDelivr'in "full" dağıtımına işaret ediyoruz.
            return window.loadPyodide({
              indexURL: "https://cdn.jsdelivr.net/pyodide/v" + version + "/full/",
            });
          })
          .then(function (pyodide) {
            self._log("Paketler yükleniyor (pandas, numpy)...");
            return pyodide.loadPackage(["pandas", "numpy"]).then(function () {
              return pyodide;
            });
          })
          .then(function (pyodide) {
            self._pyodide = pyodide;
            self._log("Pyodide hazır.");
            self.dispatchEvent(new CustomEvent("onEngineReady", { detail: {} }));
            return pyodide;
          });
      })();

      return this._pyodideLoadingPromise;
    }

    _loadScriptOnce(url) {
      if (window.loadPyodide) return Promise.resolve();
      var existing = document.querySelector('script[src="' + url + '"]');
      if (existing) {
        return new Promise(function (resolve, reject) {
          existing.addEventListener("load", function () {
            resolve();
          });
          existing.addEventListener("error", reject);
        });
      }
      return new Promise(function (resolve, reject) {
        var script = document.createElement("script");
        script.src = url;
        script.onload = function () {
          resolve();
        };
        script.onerror = function () {
          reject(new Error("Pyodide script yüklenemedi: " + url));
        };
        document.head.appendChild(script);
      });
    }
  }

  customElements.define("com-example-pythonengine", PythonEngine);
})();
