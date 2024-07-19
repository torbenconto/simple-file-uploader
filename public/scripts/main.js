function main() {
    document.querySelector('form').addEventListener('submit', handleSubmit);
}

document.addEventListener('DOMContentLoaded', main);

function setErrorMessage(message) {
    const errorElement = document.querySelector('#error');
    errorElement.textContent = message;
}

function clearErrorMessage() {
    const errorElement = document.querySelector('#error');
    errorElement.textContent = '';
}

function handleSubmit(event) {
    event.preventDefault();
    const fileInput = event.target.querySelector('input[type="file"]');
    const file = fileInput.files[0];

    if (!file) {
        setErrorMessage('Please select a file to upload');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    // Show progress container
    document.getElementById('progress-container').style.display = 'block';
    const progressBar = document.getElementById('upload-progress');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/upload', true);

    xhr.upload.onprogress = function(e) {
        if (e.lengthComputable) {
            progressBar.value = (e.loaded / e.total) * 100;
        }
    };

    xhr.onload = function() {
        if (xhr.status === 200) {
            const response = JSON.parse(xhr.responseText);
            let form = document.querySelector('form');
            form.innerHTML = `<p>File uploaded successfully at: </p> <a href="/${response.sha256}">${response.fileId}</a>`;
        } else {
            const errorResponse = JSON.parse(xhr.responseText);
            setErrorMessage(`Failed to upload the file. Status: ${xhr.status}, Response: ${errorResponse.message}`);
        }
        setTimeout(clearErrorMessage, 5000); // Clear the message after 5 seconds
        document.getElementById('progress-container').style.display = 'none'; // Hide progress bar
    };

    xhr.onerror = function() {
        setErrorMessage('The upload encountered an error.');
        document.getElementById('progress-container').style.display = 'none'; // Hide progress bar
    };

    xhr.send(formData);
}