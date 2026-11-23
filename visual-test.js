// Visual test, shown in test.html below the unit tests: the screen chart of index.html (drawn from
// test-bikes.json) next to the reference image visual-reference.png, with a slider to compare them
// by eye. "Save as new reference…" saves the current drawing as the new reference image.
//
// index.html is loaded in a hidden frame, in the light theme and as if today were TEST_TODAY, so the
// drawing doesn't change from day to day. Text is drawn with the computer's own fonts, so a
// reference image saved on another computer or browser shows small differences in all text.
(() => {
  const TEST_TODAY = '2025-09-30';
  const IMAGE_SCALE = 2; // image pixels per chart pixel
  const REFERENCE_FILE_NAME = 'visual-reference.png';
  // The chart is styled by styles.css and CSS variables, which an SVG drawn as an image can't see,
  // so each element's computed values for these properties are copied onto it.
  const COPIED_STYLE_PROPERTIES = [
    'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray',
    'stroke-linejoin', 'stroke-linecap', 'opacity', 'font-family', 'font-size', 'font-weight',
    'font-variant-numeric', 'letter-spacing', 'text-decoration',
  ];

  const statusElement = document.getElementById('visual-status');
  const stage = document.getElementById('visual-stage');
  const referenceImage = document.getElementById('visual-reference-image');
  const currentImage = document.getElementById('visual-current-image');
  const divider = document.getElementById('visual-divider');
  const splitSlider = document.getElementById('visual-split-slider');
  const saveReferenceButton = document.getElementById('save-reference-button');
  let currentPngBlob = null;

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

  const showStatus = (text, className = '') => Object.assign(statusElement, { textContent: text, className });

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

  async function runVisualTest(frame) {
    const frameDocument = frame.contentDocument;
    frameDocument.documentElement.dataset.theme = 'light';
    const chart = await waitForChart(frameDocument);
    const dataErrors = [...frameDocument.querySelectorAll('#data-errors-list li')].map(item => item.textContent);
    if (dataErrors.length) {
      document.getElementById('visual-errors').append(...dataErrors.map(error =>
        Object.assign(document.createElement('li'), { className: 'fail', textContent: '✗ ' + error })));
    }
    if (!chart) return showStatus('The chart was not drawn', 'fail');

    const backgroundColor = getComputedStyle(frameDocument.getElementById('chart-container')).backgroundColor;
    currentPngBlob = await chartToPngBlob(chart, backgroundColor);
    currentImage.src = URL.createObjectURL(currentPngBlob);
    await currentImage.decode();
    saveReferenceButton.disabled = false;
    showStatus(dataErrors.length ? `${dataErrors.length} data errors in test-bikes.json` : 'Drawn. Compare it with the reference.', dataErrors.length ? 'fail' : '');
    updateStage();
  }

  // The reference underneath, the current drawing on top, clipped to the right of the divider.
  function updateStage() {
    const images = [referenceImage, currentImage].filter(image => image.naturalWidth && !image.hidden);
    for (const image of images) image.style.width = image.naturalWidth / IMAGE_SCALE + 'px';
    stage.style.width = Math.max(0, ...images.map(image => image.naturalWidth / IMAGE_SCALE)) + 'px';
    stage.style.height = Math.max(0, ...images.map(image => image.naturalHeight / IMAGE_SCALE)) + 'px';
    const splitPercent = Number(splitSlider.value);
    currentImage.style.clipPath = `inset(0 0 0 ${splitPercent}%)`;
    divider.style.left = splitPercent + '%';
  }
  splitSlider.addEventListener('input', updateStage);
  // Dragging across the image moves the divider too.
  stage.addEventListener('pointerdown', event => { stage.setPointerCapture(event.pointerId); moveSplitTo(event); });
  stage.addEventListener('pointermove', event => { if (stage.hasPointerCapture(event.pointerId)) moveSplitTo(event); });
  function moveSplitTo(event) {
    const bounds = stage.getBoundingClientRect();
    splitSlider.value = Math.min(100, Math.max(0, (event.clientX - bounds.left) / bounds.width * 100));
    updateStage();
  }

  referenceImage.addEventListener('load', updateStage);
  referenceImage.addEventListener('error', () => {
    referenceImage.hidden = true;
    document.getElementById('reference-missing').hidden = false;
  });
  referenceImage.src = REFERENCE_FILE_NAME + '?' + Date.now(); // never a cached copy

  // Saves with the browser's file picker where there is one (Chrome, Edge), otherwise as a download.
  saveReferenceButton.addEventListener('click', async () => {
    if (window.showSaveFilePicker) {
      try {
        const fileHandle = await showSaveFilePicker({ suggestedName: REFERENCE_FILE_NAME, types: [{ description: 'PNG image', accept: { 'image/png': ['.png'] } }] });
        const writable = await fileHandle.createWritable();
        await writable.write(currentPngBlob);
        await writable.close();
        return;
      } catch (error) {
        if (error.name === 'AbortError') return; // the picker was cancelled
      }
    }
    const downloadLink = Object.assign(document.createElement('a'), { href: URL.createObjectURL(currentPngBlob), download: REFERENCE_FILE_NAME });
    downloadLink.click();
    URL.revokeObjectURL(downloadLink.href);
  });

  const frame = Object.assign(document.createElement('iframe'), {
    id: 'visual-test-frame', src: `index.html?today=${TEST_TODAY}`, title: 'Bike timeline drawn for the visual test', tabIndex: -1,
  });
  frame.setAttribute('aria-hidden', 'true');
  frame.addEventListener('load', () => runVisualTest(frame).catch(error => showStatus(error.message, 'fail')));
  document.body.append(frame);
})();
