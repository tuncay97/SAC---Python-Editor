(function () {
  let template = document.createElement("template");
  template.innerHTML = `
    <style>
      :host { display: block; font-family: sans-serif; padding: 15px; background: #fafafa; border: 1px solid #e0e0e0; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
      .container { display: flex; flex-direction: row; gap: 15px; height: 450px; }
      .box { flex: 1; display: flex; flex-direction: column; }
      h3 { margin-top: 0; color: #333; font-size: 14px; border-bottom: 2px solid #0070f3; padding-bottom: 5px; }
      textarea { flex: 1; font-family: 'Courier New', Courier, monospace; font-size: 13px; padding: 12px; border: 1px solid #ccc; border-radius: 4px; resize: none; background-color: #fff; color: #333; line-height: 1.5; }
      textarea:focus { border-color: #0070f3; outline: none; }
      button { margin-top: 10px; padding: 10px; background: #0070f3; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; transition: background 0.2s; }
      button:hover { background: #0051a8; }
      button:disabled { background: #ccc; cursor: not-allowed; }
      pre { flex: 1; background: #1e1e1e; color: #39ff14; padding: 12px; overflow: auto; margin: 0; font-size: 12px; border-radius: 4px; border: 1px solid #333; font-family: 'Courier New', Courier, monospace; }
      .status { font-size: 12px; color: #666; margin-bottom: 10px; font-weight: 500; display: flex; align-items: center; gap: 5px; }
      .status-ready { color: #2e7d32; }
    </style>
    <div class="status" id="status">⏳ Python Runtime (Pyodide) hazırlanıyor...</div>
    <div class="container">
      <div class="box">
        <h3>1. Python Kod Editörü</h3>
        <textarea id="code"># 'sac_data' değişkeni SAC tablonuzu içerir (Liste biçiminde).
result = []
if 'sac_data' in globals() and sac_data:
    for row in sac_data:
        new_row = dict(row)
        new_row["ISLENDI_MI"] = "Evet"
        result.append(new_row)
else:
    result = [{"bilgi": "SAC verisi henüz baglanmadi veya bos."}]
        </textarea>
        <button id="runBtn" disabled>▶ Kodu Çalıştır</button>
      </div>
      <div class="box">
        <h3>2. Çıktı Konsolu (JSON Sonucu)</h3>
        <pre id="output">Kodun çalıştırılması bekleniyor...</pre>
      </div>
    </div>
  `;

  class SACPythonEditor extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.shadowRoot.appendChild(template.content.cloneNode(true));
      this._sacData = [];
      this.pyodide = null;
      this.shadowRoot.getElementById("runBtn").addEventListener("click", () => this.runPython());
      this.initPython();
    }

    async initPython() {
      const statusEl = this.shadowRoot.getElementById("status");
      try {
        const { loadPyodide } = await import("https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.mjs");
        this.pyodide = await loadPyodide({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/",
          fullStdLib: false
        });
        statusEl.innerText = "✅ Python (Pyodide WASM) Başarıyla Yüklendi! Hazır.";
        statusEl.className = "status status-ready";
        this.shadowRoot.getElementById("runBtn").removeAttribute("disabled");
      } catch (e) {
        statusEl.innerText = "❌ Python yüklenirken hata oluştu: " + e.message;
      }
    }

    onCustomWidgetAfterUpdate(changedProperties) {
      if (this.dataBindings) {
        try {
          const dataBinding = this.dataBindings.getDataBinding("dataModel");
          if (dataBinding) {
            let rawData = null;
            if (typeof dataBinding.getFlattenedData === 'function') {
              rawData = dataBinding.getFlattenedData();
            } else if (typeof dataBinding.getData === 'function') {
              rawData = dataBinding.getData();
            } else if (dataBinding.data) {
              rawData = dataBinding.data;
            }

            if (rawData && Array.isArray(rawData)) {
              this._sacData = rawData.map(row => {
                let parsedRow = {};
                Object.keys(row).forEach(key => {
                  if (row[key] && row[key].id !== undefined) {
                    parsedRow[key] = row[key].id;
                  } else if (row[key] && row[key].raw !== undefined) {
                    parsedRow[key] = row[key].raw;
                  } else {
                    parsedRow[key] = row[key];
                  }
                });
                return parsedRow;
              });
            }
          }
        } catch (err) {
          console.log("Veri baglantisi kontrol ediliyor...");
        }
      }
    }

    async runPython() {
      if (!this.pyodide) return;
      const code = this.shadowRoot.getElementById("code").value;
      const outputBox = this.shadowRoot.getElementById("output");
      outputBox.innerText = "Hesaplanıyor...";

      try {
        this.pyodide.globals.set("sac_data", this.pyodide.toPy(JSON.parse(JSON.stringify(this._sacData))));
        await this.pyodide.runPythonAsync(code);
        if (this.pyodide.globals.has("result")) {
          let pyResult = this.pyodide.globals.get("result");
          outputBox.innerText = JSON.stringify(pyResult.toJs(), null, 2);
        } else {
          outputBox.innerText = "Uyarı: 'result' degiskeni bulunamadi.";
        }
      } catch (err) {
        outputBox.innerText = `Python Hatası:\n${err.message}`;
      }
    }
  }
  customElements.define("sac-python-editor", SACPythonEditor);
})();
