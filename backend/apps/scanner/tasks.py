import os
import re
import shutil
import uuid
import zipfile
from pathlib import Path
from datetime import datetime, timezone as dt_timezone
from celery import shared_task
from django.utils import timezone
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import FileSystemStorage
import io
from io import BytesIO
import xml.etree.ElementTree as ET
from PIL import Image


SUPPORTED_EXTENSIONS = {
    "archive": {".cbz", ".zip", ".cbr", ".rar", ".cb7", ".7z", ".cbt"},
    "epub": {".epub"},
    "pdf": {".pdf"},
    "image": {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"},
}


def get_format(ext):
    ext = ext.lower()
    for fmt, exts in SUPPORTED_EXTENSIONS.items():
        if ext in exts:
            return fmt
    return "unknown"


def count_pages(file_path, fmt):
    try:
        if fmt == "archive":
            # Tentativa 1: CBZ/ZIP
            try:
                with zipfile.ZipFile(file_path) as zf:
                    return len([n for n in zf.namelist() if not n.endswith("/")])
            except Exception:
                pass

            # Tentativa 2: 7z (py7zr)
            try:
                import py7zr

                with py7zr.SevenZipFile(file_path, mode="r") as z7:
                    names = [n for n in z7.getnames() if not n.endswith("/")]
                    return len(names)
            except Exception:
                pass

            # Tentativa 3: RAR (rarfile)
            try:
                import rarfile

                with rarfile.RarFile(file_path) as rf:
                    return len([n for n in rf.namelist() if not n.endswith("/")])
            except Exception:
                pass
        if fmt == "pdf":
            import pypdf
            with open(file_path, "rb") as f:
                return len(pypdf.PdfReader(f).pages)
        if fmt == "epub":
            return 0  # EPUB pages are calculated differently
        if fmt == "image":
            return 1
    except Exception:
        pass
    return 0


def _extract_cover_bytes(file_path, ext):
    """Extract cover image from a file. Returns (bytes, ext_str) or (None, None)."""
    image_exts = (".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif")

    # EPUB — handle before ZIP since EPUB is a ZIP internally
    if ext == ".epub":
        try:
            import re as _re
            import posixpath as _posix
            import ebooklib
            from ebooklib import epub as epub_lib

            book = epub_lib.read_epub(file_path)

            # Build a map of file_name → item for fast lookup
            image_map = {}
            candidates = []
            for item in book.get_items():
                try:
                    if item.get_type() != ebooklib.ITEM_IMAGE:
                        continue
                    name = item.file_name
                    if not name.lower().endswith(image_exts):
                        continue
                    image_map[name] = item
                    score = 0
                    props = getattr(item, "properties", "") or ""
                    if "cover-image" in props:
                        score = 3
                    elif "cover" in (item.id or "").lower():
                        score = 2
                    elif "cover" in name.lower():
                        score = 1
                    candidates.append((score, item))
                except Exception:
                    continue

            # Strategy 1–3: best scored image (cover-image prop > cover id > cover filename > any)
            if candidates:
                candidates.sort(key=lambda x: -x[0])
                best_score, best_item = candidates[0]
                if best_score > 0:
                    return best_item.get_content(), Path(best_item.file_name).suffix.lower()

            # Strategy 4: first image referenced in the first spine page (= visual first page)
            spine_pages = []
            for item_id, _ in book.spine:
                sp = book.get_item_with_id(item_id)
                if sp is None:
                    continue
                sp_ext = sp.file_name.rsplit(".", 1)[-1].lower()
                if sp.get_type() == ebooklib.ITEM_DOCUMENT or sp_ext in ("html", "xhtml", "htm"):
                    spine_pages.append(sp)

            for sp in spine_pages[:3]:  # check first 3 spine pages
                html = sp.get_content().decode("utf-8", errors="replace")
                m = _re.search(r'<img[^>]+src=["\']([^"\']+)["\']', html, _re.IGNORECASE)
                if m:
                    rel_src = m.group(1).split("#")[0]
                    base_dir = _posix.dirname(sp.file_name)
                    resolved = _posix.normpath(_posix.join(base_dir, rel_src)).lstrip("/")
                    if resolved in image_map:
                        img_item = image_map[resolved]
                        return img_item.get_content(), Path(img_item.file_name).suffix.lower()

            # Strategy 5: first image in the book (last resort)
            if candidates:
                item = candidates[0][1]
                return item.get_content(), Path(item.file_name).suffix.lower()
        except Exception:
            pass
        return None, None

    # PDF — extract the first embedded image from page 0
    if ext == ".pdf":
        try:
            import pypdf

            with open(file_path, "rb") as f:
                reader = pypdf.PdfReader(f)
                if reader.pages:
                    page = reader.pages[0]
                    imgs = getattr(page, "images", None)
                    if imgs:
                        img_obj = imgs[0]
                        img_bytes = img_obj.data
                        name = getattr(img_obj, "name", "") or ""
                        img_ext = Path(name).suffix.lower() if "." in name else ".jpg"
                        return img_bytes, img_ext
        except Exception:
            pass
        return None, None

    # ZIP / CBZ
    try:
        with zipfile.ZipFile(file_path) as zf:
            names = sorted(
                [n for n in zf.namelist() if not n.endswith("/") and n.lower().endswith(image_exts)],
                key=lambda x: x.lower(),
            )
            if names:
                return zf.read(names[0]), Path(names[0]).suffix.lower()
    except Exception:
        pass

    # 7z
    try:
        import py7zr

        with py7zr.SevenZipFile(file_path, mode="r") as z7:
            files = z7.readall()
            names = sorted(
                [n for n in files if n.lower().endswith(image_exts)],
                key=lambda x: x.lower(),
            )
            if names:
                bio = files[names[0]]
                try:
                    return bio.read(), Path(names[0]).suffix.lower()
                except Exception:
                    pass
    except Exception:
        pass

    # RAR
    try:
        import rarfile

        with rarfile.RarFile(file_path) as rf:
            names = sorted(
                [i.filename for i in rf.infolist() if not i.isdir() and i.filename.lower().endswith(image_exts)],
                key=lambda x: x.lower(),
            )
            if names:
                with rf.open(names[0]) as f:
                    return f.read(), Path(names[0]).suffix.lower()
    except Exception:
        pass

    return None, None


def _parse_comicinfo(file_path):
    """Procura e parseia ComicInfo.xml dentro do arquivo. Retorna dict com campos encontrados."""
    candidates = ["comicinfo.xml", "ComicInfo.xml"]

    # ZIP / CBZ
    try:
        with zipfile.ZipFile(file_path) as zf:
            for name in zf.namelist():
                if Path(name).name in candidates:
                    data = zf.read(name)
                    try:
                        root = ET.fromstring(data)
                        return _comicinfo_from_xml(root)
                    except Exception:
                        return {}
    except Exception:
        pass

    # 7z
    try:
        import py7zr

        with py7zr.SevenZipFile(file_path, mode="r") as z7:
            files = z7.readall()
            for name in files.keys():
                if Path(name).name in candidates:
                    try:
                        data = files[name].read()
                        root = ET.fromstring(data)
                        return _comicinfo_from_xml(root)
                    except Exception:
                        return {}
    except Exception:
        pass

    # RAR
    try:
        import rarfile

        with rarfile.RarFile(file_path) as rf:
            for info in rf.infolist():
                if Path(info.filename).name in candidates:
                    try:
                        with rf.open(info) as f:
                            data = f.read()
                            root = ET.fromstring(data)
                            return _comicinfo_from_xml(root)
                    except Exception:
                        return {}
    except Exception:
        pass

    return {}

    # EPUB fallback not found in archives



def _comicinfo_from_xml(root):
    out = {}
    # simples
    title = root.findtext("Title") or root.findtext("Series")
    summary = root.findtext("Summary")
    year = root.findtext("Year")
    publisher = root.findtext("Publisher") or root.findtext("PublishingCompany")
    rating = root.findtext("Rating")
    age = root.findtext("AgeRating") or root.findtext("Maturity")
    out["title"] = title
    out["summary"] = summary
    if year and year.isdigit():
        out["year"] = int(year)
    if publisher:
        out["publisher"] = publisher
    if rating:
        try:
            out["rating"] = float(rating)
        except Exception:
            pass
    if age:
        out["age_rating"] = age

    # tags/genres (Tags pode ser um elemento com Tag childs)
    tags = []
    tags_text = root.findtext("Tags")
    if tags_text:
        for t in tags_text.split(","):
            tags.append(t.strip())
    # People: Writer, Penciller, Inker, Colorist, etc.
    people = []
    for role in ("Writer", "Penciller", "Inker", "Colorist", "Letterer", "Editor", "Translator"):
        val = root.findtext(role)
        if val:
            for name in val.split(","):
                people.append({"name": name.strip(), "role": role.lower()})

    if tags:
        out["tags"] = tags
    if people:
        out["people"] = people
    return out


@shared_task(bind=True, max_retries=3)
def scan_library(self, library_id):
    from apps.library.models import (
        Library,
        Series,
        Volume,
        Chapter,
        MangaFile,
        SeriesMetadata,
        Genre,
        Tag,
        Person,
    )
    from apps.scanner.models import ScanJob

    job = ScanJob.objects.create(library_id=library_id, status="running", started_at=timezone.now())

    try:
        library = Library.objects.get(pk=library_id)
        files_added = 0

        for folder_path in library.folder_paths:
            if not os.path.isdir(folder_path):
                continue
            for root, dirs, files in os.walk(folder_path):
                dirs.sort()
                for filename in sorted(files):
                    ext = Path(filename).suffix.lower()
                    fmt = get_format(ext)
                    if fmt == "unknown":
                        continue

                    full_path = os.path.join(root, filename)
                    if MangaFile.objects.filter(file_path=full_path).exists():
                        continue

                    # Parse series/volume/chapter from path
                    series_name, volume_name, chapter_range = _parse_path(
                        full_path, folder_path, library.type
                    )

                    series, _ = Series.objects.get_or_create(
                        library=library,
                        name=series_name,
                        defaults={"sort_name": series_name},
                    )

                    # Extrair e salvar ComicInfo metadata se presente
                    try:
                        comicinfo = _parse_comicinfo(full_path)
                        if comicinfo:
                            sm, _ = SeriesMetadata.objects.get_or_create(series=series)
                            if comicinfo.get("summary") and not sm.summary_locked and not sm.summary:
                                sm.summary = comicinfo.get("summary")
                            if comicinfo.get("year") and not sm.release_year_locked and not sm.release_year:
                                sm.release_year = comicinfo.get("year")
                            # tags
                            if comicinfo.get("tags") and not sm.tags_locked:
                                for t in comicinfo.get("tags"):
                                    tag_obj, _ = Tag.objects.get_or_create(name=t)
                                    sm.tags.add(tag_obj)
                            # people
                            if comicinfo.get("people") and not sm.people_locked:
                                for p in comicinfo.get("people"):
                                    role = p.get("role")[:30] if p.get("role") else ""
                                    person_obj, _ = Person.objects.get_or_create(name=p.get("name"), role=role)
                                    sm.people.add(person_obj)
                            # publisher
                            if comicinfo.get("publisher") and not sm.summary_locked and not sm.publisher:
                                sm.publisher = comicinfo.get("publisher")
                            # rating
                            if comicinfo.get("rating") and not sm.rating:
                                try:
                                    sm.rating = float(comicinfo.get("rating"))
                                except Exception:
                                    pass
                            # age rating mapping heurístico
                            if comicinfo.get("age_rating") and (not sm.age_rating or sm.age_rating == 0):
                                ar = str(comicinfo.get("age_rating")).lower()
                                mapped = None
                                if any(s in ar for s in ("teen", "13", "12")):
                                    mapped = 2  # Teen
                                elif any(s in ar for s in ("mature", "16", "17")):
                                    mapped = 3  # Mature
                                elif any(s in ar for s in ("18", "adult", "adults")):
                                    mapped = 4  # Adults Only
                                if mapped:
                                    sm.age_rating = mapped
                            # language
                            if comicinfo.get("language") and not sm.language:
                                sm.language = comicinfo.get("language")
                            sm.save()
                    except Exception:
                        pass

                    # Extrair capa do arquivo para a série/volume caso não exista (salva thumbnail)
                    cover_just_saved = False
                    if not series.cover_image:
                        try:
                            img_bytes, img_ext = _extract_cover_bytes(full_path, ext)
                            if img_bytes:
                                # gera múltiplos tamanhos e salva em COVERS_ROOT
                                try:
                                    sizes = {
                                        "large": (600, 900),
                                        "medium": (300, 450),
                                        "thumb": (120, 180),
                                    }
                                    storage = FileSystemStorage(location=settings.COVERS_ROOT)
                                    main_bytes = None
                                    for label, size in sizes.items():
                                        try:
                                            im = Image.open(BytesIO(img_bytes))
                                            im = im.convert("RGB")
                                            im.thumbnail(size, Image.LANCZOS)
                                            out = BytesIO()
                                            im.save(out, format="JPEG", quality=85)
                                            out.seek(0)
                                            filename = f"series_{series.id}_cover_{label}.jpg"
                                            # salva no COVERS_ROOT
                                            storage.save(filename, ContentFile(out.read()))
                                            # guarda o maior para salvar no campo ImageField
                                            if label == "large":
                                                main_bytes = out.getvalue()
                                        except Exception:
                                            continue

                                    # salva no storage padrão (MEDIA) o tamanho large para compatibilidade
                                    if main_bytes:
                                        series_filename = f"{series.id}_cover.jpg"
                                        series.cover_image.save(series_filename, ContentFile(main_bytes), save=True)
                                    else:
                                        # fallback: salva original no MEDIA
                                        series_filename = f"{series.id}_cover{img_ext or '.jpg'}"
                                        series.cover_image.save(series_filename, ContentFile(img_bytes), save=True)
                                    cover_just_saved = True
                                except Exception:
                                    # fallback simples
                                    filename = f"{series.id}_cover{img_ext or '.jpg'}"
                                    series.cover_image.save(filename, ContentFile(img_bytes), save=True)
                                    cover_just_saved = True
                        except Exception:
                            pass
                    if cover_just_saved:
                        try:
                            from apps.library.tasks import extract_dominant_color
                            extract_dominant_color.delay(series.id)
                        except Exception:
                            pass
                    volume, _ = Volume.objects.get_or_create(
                        series=series,
                        name=volume_name,
                    )
                    if not volume.cover_image and series.cover_image:
                        try:
                            # reutiliza a mesma imagem da série para o volume se disponível
                            volume.cover_image = series.cover_image
                            volume.save(update_fields=["cover_image"])
                        except Exception:
                            pass
                    chapter, _ = Chapter.objects.get_or_create(
                        volume=volume,
                        range=chapter_range,
                        defaults={"title": chapter_range},
                    )
                    pages = count_pages(full_path, fmt)
                    try:
                        mf = MangaFile.objects.create(
                            chapter=chapter,
                            file_path=full_path,
                            format=fmt,
                            pages=pages,
                            bytes=os.path.getsize(full_path),
                            extension=ext,
                            last_modified=datetime.fromtimestamp(
                                os.path.getmtime(full_path), tz=dt_timezone.utc
                            ),
                        )
                    except Exception as file_exc:
                        from apps.library.models import MediaError
                        MediaError.objects.get_or_create(
                            file_path=full_path,
                            defaults={
                                "extension": ext,
                                "error_type": "unreadable",
                                "details": str(file_exc),
                                "series": series,
                            },
                        )
                        continue
                    chapter.pages = max(chapter.pages, pages)
                    chapter.save(update_fields=["pages"])
                    files_added += 1

        # Update series-level page counts and reading time estimates
        _update_series_stats(library_id)

        library.last_scanned = timezone.now()
        library.save(update_fields=["last_scanned"])

        job.status = "completed"
        job.files_added = files_added
        job.finished_at = timezone.now()
        job.save()

    except Exception as exc:
        job.status = "failed"
        job.error_message = str(exc)
        job.finished_at = timezone.now()
        job.save()
        raise self.retry(exc=exc, countdown=60)


def _update_series_stats(library_id):
    """Recalculate pages, word_count and reading-time estimates for all series in a library."""
    from django.db.models import Sum
    from apps.library.models import Library, Series

    # manga/comics: ~200 pages/hour — books/novels: uses word_count at 250 wpm
    PAGES_PER_HOUR_IMAGES = 200
    WORDS_PER_MINUTE = 250

    try:
        library = Library.objects.get(pk=library_id)
        for series in library.series.prefetch_related("volumes__chapters__files").all():
            total_pages = 0
            total_words = 0
            for volume in series.volumes.all():
                for chapter in volume.chapters.all():
                    ch_pages = chapter.files.aggregate(s=Sum("pages"))["s"] or 0
                    chapter.pages = ch_pages
                    chapter.save(update_fields=["pages"])
                    total_pages += ch_pages
                    total_words += chapter.word_count or 0

            series.pages = total_pages
            series.word_count = total_words

            if total_words > 0:
                hours = total_words / (WORDS_PER_MINUTE * 60)
            elif total_pages > 0:
                hours = total_pages / PAGES_PER_HOUR_IMAGES
            else:
                hours = 0

            series.avg_hours_to_read = round(hours, 2)
            series.min_hours_to_read = round(hours * 0.8, 2)
            series.max_hours_to_read = round(hours * 1.2, 2)
            series.save(update_fields=[
                "pages", "word_count",
                "avg_hours_to_read", "min_hours_to_read", "max_hours_to_read",
            ])
    except Exception:
        pass


@shared_task
def scan_all_libraries():
    from apps.library.models import Library
    for library in Library.objects.all():
        scan_library.delay(library.id)


@shared_task
def scan_series(series_id):
    from apps.library.models import Series
    series = Series.objects.select_related("library").get(pk=series_id)
    scan_library.delay(series.library_id)


def _series_name_from_filename(filename: str) -> str:
    """Extrai nome da série a partir de padrões comuns de nomenclatura."""
    p = Path(filename)
    name = p.stem
    # dotfiles without a real extension (e.g. ".cbz") have no series name
    if not p.suffix and name.startswith("."):
        return "Unknown Series"
    patterns = [
        r"\s*[-–]\s*[vV]ol?\.?\s*\d+.*",
        r"\s*[-–]\s*[cC]h(apter)?\.?\s*[\d.]+.*",
        r"\s*[vV]ol?\.?\s*\d+\s*[cC]h(apter)?.*",
        r"\s*[cC]h(apter)?\.?\s*[\d.]+.*",
        r"\s*#\s*\d+.*",
        r"\s*\(\d{4}\).*",
        r"\s*\[\d{4}\].*",
    ]
    for p in patterns:
        cleaned = re.sub(p, "", name, flags=re.IGNORECASE).strip()
        if cleaned and cleaned != name:
            return cleaned
    return name.strip() or "Unknown Series"


def _series_name_from_epub(file_path: str) -> str | None:
    """Lê dc:title do OPF dentro do EPUB."""
    try:
        with zipfile.ZipFile(file_path) as zf:
            container = zf.read("META-INF/container.xml")
            tree = ET.fromstring(container)
            ns = {"c": "urn:oasis:names:tc:opendocument:xmlns:container"}
            rootfile = tree.find(".//c:rootfile", ns)
            if rootfile is None:
                return None
            opf_path = rootfile.get("full-path", "")
            opf_data = zf.read(opf_path)
            opf_tree = ET.fromstring(opf_data)
            ns_dc = {"dc": "http://purl.org/dc/elements/1.1/"}
            title_el = opf_tree.find(".//dc:title", ns_dc)
            if title_el is not None and title_el.text:
                return title_el.text.strip()
    except Exception:
        pass
    return None


def _sanitize_dirname(name: str) -> str:
    """Remove caracteres inválidos para nomes de diretório."""
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name)
    name = name.strip(". ")
    return name[:200] or "Unknown Series"


@shared_task
def process_upload(upload_job_id: int):
    from apps.scanner.models import UploadJob

    try:
        job = UploadJob.objects.select_related("library").get(pk=upload_job_id)
    except UploadJob.DoesNotExist:
        return

    job.status = "processing"
    job.save(update_fields=["status"])

    try:
        file_path = Path(job.temp_path)
        if not file_path.exists():
            raise FileNotFoundError(f"Arquivo temporário não encontrado: {file_path}")

        ext = file_path.suffix.lower()
        library = job.library

        if not library.folder_paths:
            raise ValueError("Biblioteca sem folder_path configurado")

        # ── Extração do nome da série ──────────────────────────────────────────
        series_name = None

        if ext in (".cbz", ".cbr", ".zip", ".cb7"):
            info = _parse_comicinfo(str(file_path))
            series_name = info.get("title") or info.get("Series")

        if ext == ".epub":
            series_name = _series_name_from_epub(str(file_path))

        if not series_name:
            series_name = _series_name_from_filename(file_path.name)

        safe_series = _sanitize_dirname(series_name)

        # ── Mover para pasta da biblioteca ────────────────────────────────────
        base = Path(library.folder_paths[0])
        target_dir = base / safe_series
        target_dir.mkdir(parents=True, exist_ok=True)

        # Sanitiza o nome do arquivo de destino
        safe_filename = re.sub(r"[\x00/\\]", "_", file_path.name)
        target = target_dir / safe_filename

        # Resolve colisão de nomes
        if target.exists():
            stem, suffix = Path(safe_filename).stem, Path(safe_filename).suffix
            counter = 1
            while target.exists():
                target = target_dir / f"{stem}_{counter}{suffix}"
                counter += 1

        shutil.move(str(file_path), str(target))

        # ── Limpa diretório temporário ────────────────────────────────────────
        try:
            file_path.parent.rmdir()
        except Exception:
            pass

        job.status = "completed"
        job.target_path = str(target)
        job.series_name = series_name
        job.processed_at = timezone.now()
        job.save()

        # ── Dispara scan da biblioteca ────────────────────────────────────────
        scan_library.delay(library.id)

    except Exception as exc:
        job.status = "failed"
        job.error_message = str(exc)
        job.processed_at = timezone.now()
        job.save()
        raise


def _parse_path(file_path, base_folder, library_type):
    rel = os.path.relpath(file_path, base_folder)
    parts = Path(rel).parts
    filename = Path(file_path).stem

    if len(parts) >= 3:
        series_name = parts[0]
        volume_name = parts[1]
        chapter_range = filename
    elif len(parts) == 2:
        series_name = parts[0]
        volume_name = "Volume 1"
        chapter_range = filename
    else:
        series_name = filename
        volume_name = "Volume 1"
        chapter_range = "Chapter 1"

    return series_name, volume_name, chapter_range
