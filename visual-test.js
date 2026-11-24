// Visual tests, shown in test.html below the unit tests: the chart of index.html (drawn from
// test-bikes.json) next to a reference image, with a slider to compare them by eye. There are two:
// the chart as it is shown on screen (visual-reference.png) and as it prints (visual-reference-print.png).
// "Save as new reference…" saves the current drawing as the new reference image.
//
// index.html is loaded in a hidden frame, in the light theme and as if today were TEST_TODAY, so the
// drawing doesn't change from day to day. The print drawing is the same chart with the class
// print-view on <html>, which shows it as it prints (see styles.css). Text is drawn with the
// computer's own fonts, so a reference image saved on another computer or browser shows small
// differences in all text.
(() => {
  const TEST_TODAY = '2025-09-30';
  const IMAGE_SCALE = 2; // image pixels per chart pixel
  const VISUAL_TESTS = [
    { title: 'Screen', referenceFileName: 'visual-reference.png', printView: false },
    { title: 'Print', referenceFileName: 'visual-reference-print.png', printView: true },
  ];
  // The chart is styled by styles.css and CSS variables, which an SVG drawn as an image can't see,
  // so each element's computed values for these properties are copied onto it.
  const COPIED_STYLE_PROPERTIES = [
    'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray',
    'stroke-linejoin', 'stroke-linecap', 'opacity', 'font-family', 'font-size', 'font-weight',
    'font-variant-numeric', 'letter-spacing', 'text-decoration', 'display',
  ];

  // The chart's SVG as a standalone image: computed styles copied inline, with the chart's background.
  function chartToPngBlob(svgElement, backgroundColor) {
    const svgCopy = svgElement.cloneNode(true);
    const originalElements = [svgElement, ...svgElement.querySelectorAll('*')];
    const copiedElements = [svgCopy, ...svgCopy.querySelectorAll('*')];
    originalElements.forEach((originalElement, index) => {
      const computedStyle = originalElement.ownerDocument.defaultView.getComputedStyle(originalElement);
      copiedElements[index].removeAttribute('class');
      copiedElements[index].setAttribute('style',
        COPIED_STYLE_PROPERTIES.map(property => `${property}:${computedStyle.getPropertyValue(property)}`).join(';'));
    });
    const width = Number(svgElement.getAttribute('width'));
    const height = Number(svgElement.getAttribute('height'));
    svgCopy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    Object.entries({ width, height, fill: backgroundColor }).forEach(([name, value]) => background.setAttribute(name, value));
    svgCopy.prepend(background);

    return new Promise((resolve, reject) => {
      const svgImage = new Image();
      svgImage.onload = () => {
        const canvas = Object.assign(document.createElement('canvas'), { width: width * IMAGE_SCALE, height: height * IMAGE_SCALE });
        canvas.getContext('2d').drawImage(svgImage, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(resolve, 'image/png');
      };
      svgImage.onerror = () => reject(new Error('The chart could not be drawn as an image'));
      svgImage.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svgCopy));
    });
  }

  // A PNG's size in pixels, read from its header. The images are sized from this rather than from
  // naturalWidth, which some browsers scale by the resolution saved in the file's metadata.
  async function pngPixelSize(pngBlob) {
    const header = new DataView(await pngBlob.slice(0, 24).arrayBuffer());
    return { width: header.getUint32(16), height: header.getUint32(20) };
  }

  // One comparison: its section in test.html (from the template), the reference image underneath and
  // the current drawing on top, clipped to the right of the divider.
  function createComparison({ title, referenceFileName }) {
    const section = document.getElementById('visual-test-template').content.firstElementChild.cloneNode(true);
    const part = name => section.querySelector(`.visual-${name}`);
    part('title').textContent = title;
    part('reference-name').textContent = referenceFileName;
    part('missing').textContent = `There is no ${referenceFileName} yet.`;
    document.getElementById('visual-tests').append(section);

    const stage = part('stage');
    const referenceImage = part('reference-image');
    const currentImage = part('current-image');
    const splitSlider = part('split-slider');
    const saveReferenceButton = part('save-button');
    let currentPngBlob = null;
    const pixelSizeByImage = new Map(); // filled once an image is shown

    function updateStage() {
      const sizes = [...pixelSizeByImage].map(([image, pixelSize]) => {
        const size = { width: pixelSize.width / IMAGE_SCALE, height: pixelSize.height / IMAGE_SCALE };
        image.style.width = size.width + 'px';
        image.style.height = size.height + 'px';
        return size;
      });
      stage.style.width = Math.max(0, ...sizes.map(size => size.width)) + 'px';
      stage.style.height = Math.max(0, ...sizes.map(size => size.height)) + 'px';
      const splitPercent = Number(splitSlider.value);
      currentImage.style.clipPath = `inset(0 0 0 ${splitPercent}%)`;
      part('divider').style.left = splitPercent + '%';
    }
    splitSlider.addEventListener('input', updateStage);
    // Dragging across the image moves the divider too.
    const moveSplitTo = event => {
      const bounds = stage.getBoundingClientRect();
      splitSlider.value = Math.min(100, Math.max(0, (event.clientX - bounds.left) / bounds.width * 100));
      updateStage();
    };
    stage.addEventListener('pointerdown', event => { stage.setPointerCapture(event.pointerId); moveSplitTo(event); });
    stage.addEventListener('pointermove', event => { if (stage.hasPointerCapture(event.pointerId)) moveSplitTo(event); });

    // Shows the image file in the img element, sized from the file's own pixel size.
    async function showImage(image, pngBlob) {
      const pixelSize = await pngPixelSize(pngBlob);
      image.src = URL.createObjectURL(pngBlob);
      await image.decode();
      pixelSizeByImage.set(image, pixelSize);
      updateStage();
    }

    (async () => {
      const response = await fetch(referenceFileName, { cache: 'no-store' }); // never a cached copy
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      await showImage(referenceImage, await response.blob());
    })().catch(() => {
      referenceImage.hidden = true;
      part('missing').hidden = false;
    });

    // Saves with the browser's file picker where there is one (Chrome, Edge), otherwise as a download.
    saveReferenceButton.addEventListener('click', async () => {
      if (window.showSaveFilePicker) {
        try {
          const fileHandle = await showSaveFilePicker({ suggestedName: referenceFileName, types: [{ description: 'PNG image', accept: { 'image/png': ['.png'] } }] });
          const writable = await fileHandle.createWritable();
          await writable.write(currentPngBlob);
          await writable.close();
          return;
        } catch (error) {
          if (error.name === 'AbortError') return; // the picker was cancelled
        }
      }
      const downloadLink = Object.assign(document.createElement('a'), { href: URL.createObjectURL(currentPngBlob), download: referenceFileName });
      downloadLink.click();
      URL.revokeObjectURL(downloadLink.href);
    });

    return {
      showStatus: (text, className = '') => Object.assign(part('status'), { textContent: text, className: 'visual-status ' + className }),
      async showDrawing(pngBlob) {
        currentPngBlob = pngBlob;
        await showImage(currentImage, pngBlob);
        saveReferenceButton.disabled = false;
      },
    };
  }

  // Waits until index.html in the frame has loaded test-bikes.json and drawn the chart.
  async function waitForChart(frameDocument) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const chart = frameDocument.querySelector('#chart-container > svg');
      const loadError = !frameDocument.getElementById('data-errors').hidden;
      if (chart || loadError) return chart;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return null;
  }

  const comparisons = VISUAL_TESTS.map(visualTest => ({ ...visualTest, comparison: createComparison(visualTest) }));

  async function runVisualTests(frame) {
    const frameDocument = frame.contentDocument;
    frameDocument.documentElement.dataset.theme = 'light';
    const chart = await waitForChart(frameDocument);
    const dataErrors = [...frameDocument.querySelectorAll('#data-errors-list li')].map(item => item.textContent);
    if (dataErrors.length) {
      document.getElementById('visual-errors').append(...dataErrors.map(error =>
        Object.assign(document.createElement('li'), { className: 'fail', textContent: '✗ ' + error })));
    }
    for (const { printView, comparison } of comparisons) {
      if (!chart) { comparison.showStatus('The chart was not drawn', 'fail'); continue; }
      frameDocument.documentElement.classList.toggle('print-view', printView);
      const backgroundColor = getComputedStyle(frameDocument.getElementById('chart-container')).backgroundColor;
      await comparison.showDrawing(await chartToPngBlob(chart, backgroundColor));
      comparison.showStatus(dataErrors.length ? `${dataErrors.length} data errors in test-bikes.json` : 'Drawn. Compare it with the reference.', dataErrors.length ? 'fail' : '');
    }
  }

  const frame = Object.assign(document.createElement('iframe'), {
    id: 'visual-test-frame', src: `index.html?today=${TEST_TODAY}`, title: 'Bike timeline drawn for the visual tests', tabIndex: -1,
  });
  frame.setAttribute('aria-hidden', 'true');
  frame.addEventListener('load', () => runVisualTests(frame)
    .catch(error => comparisons.forEach(({ comparison }) => comparison.showStatus(error.message, 'fail'))));
  document.body.append(frame);
})();
