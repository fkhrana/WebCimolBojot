// Menyorot link navigasi saat scroll
const sections = document.querySelectorAll('section');
const navLinks = document.querySelectorAll('nav ul li a');

function removeActive() {
    navLinks.forEach(link => link.classList.remove('active'));
}

function changeActiveLink() {
    let index = sections.length;

    while(--index && window.scrollY + 60 < sections[index].offsetTop) {} // 60 = tinggi header

    removeActive();
    navLinks[index].classList.add('active');
}

changeActiveLink();
window.addEventListener('scroll', changeActiveLink);

// Tangani submit form kontak agar tidak reload halaman
document.getElementById('contact-form').addEventListener('submit', function(e) {
    e.preventDefault();
    alert('Terima kasih sudah menghubungi kami! Pesan Anda telah diterima.');
    this.reset();
});
