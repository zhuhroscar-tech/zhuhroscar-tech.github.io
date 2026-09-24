from __future__ import annotations

import json
import re
import unittest
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
SITE_URL = "https://zhuhroscar-tech.github.io/"


class SiteParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.title = ""
        self._in_title = False
        self.metas: list[dict[str, str]] = []
        self.links: list[str] = []
        self.images: list[dict[str, str]] = []
        self.anchors: list[dict[str, object]] = []
        self._anchor: dict[str, object] | None = None
        self.ids: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key: value or "" for key, value in attrs}
        if values.get("id"):
            self.ids.add(values["id"])
        if tag == "title":
            self._in_title = True
        elif tag == "meta":
            self.metas.append(values)
        elif tag == "a" and values.get("href"):
            self.links.append(values["href"])
            self._anchor = {"attrs": values, "text": ""}
        elif tag == "img":
            self.images.append(values)

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False
        elif tag == "a" and self._anchor is not None:
            self.anchors.append(self._anchor)
            self._anchor = None

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data
        if self._anchor is not None:
            self._anchor["text"] = str(self._anchor["text"]) + data


def contrast_ratio(foreground: str, background: str) -> float:
    def luminance(color: str) -> float:
        channels = [int(color[index:index + 2], 16) / 255 for index in (1, 3, 5)]
        linear = [channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4 for channel in channels]
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]

    lighter, darker = sorted((luminance(foreground), luminance(background)), reverse=True)
    return (lighter + 0.05) / (darker + 0.05)


def selector_color(css: str, selector: str) -> str:
    match = re.search(rf"^\s*{re.escape(selector)}\s*\{{([^}}]+)\}}", css, re.MULTILINE)
    if match is None:
        raise AssertionError(f"Missing CSS selector: {selector}")
    color = re.search(r"(?:^|;)\s*color:\s*(#[0-9a-fA-F]{6})", match.group(1))
    if color is None:
        raise AssertionError(f"Missing hex color for selector: {selector}")
    return color.group(1)


class PortfolioContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.index_path = ROOT / "index.html"
        cls.html = cls.index_path.read_text(encoding="utf-8")
        cls.parser = SiteParser()
        cls.parser.feed(cls.html)

    def meta_content(self, *, name: str | None = None, prop: str | None = None) -> str:
        for meta in self.parser.metas:
            if name and meta.get("name") == name:
                return meta.get("content", "")
            if prop and meta.get("property") == prop:
                return meta.get("content", "")
        return ""

    def test_identity_and_search_metadata(self) -> None:
        self.assertIn("Oscar Zhu", self.parser.title)
        description = self.meta_content(name="description")
        self.assertGreaterEqual(len(description), 80)
        self.assertIn("Mathematics and Financial Engineering", description)
        self.assertNotIn("noindex", self.html.lower())
        self.assertIn(f'<link rel="canonical" href="{SITE_URL}">', self.html)
        self.assertEqual(self.meta_content(prop="og:url"), SITE_URL)
        self.assertTrue(self.meta_content(prop="og:image").endswith("/assets/og-card.png"))

    def test_academic_program_copy_is_current(self) -> None:
        self.assertIn("Mathematics and Financial Engineering", self.html)
        self.assertNotIn("Mathematical Sciences and Financial Engineering", self.html)

    def test_core_sections_and_verified_project_links(self) -> None:
        for section_id in {"work", "about", "principles", "connect"}:
            self.assertIn(section_id, self.parser.ids)
        required = {
            "https://github.com/zhuhroscar-tech/ItoCanvas",
            "https://github.com/zhuhroscar-tech/dualTyper",
            "https://www.linkedin.com/in/huairuizhu/",
        }
        self.assertTrue(required.issubset(set(self.parser.links)))

    def test_images_are_local_present_and_described(self) -> None:
        self.assertGreaterEqual(len(self.parser.images), 3)
        for image in self.parser.images:
            self.assertTrue(image.get("alt", "").strip(), image)
            src = image.get("src", "")
            parsed = urlparse(src)
            self.assertFalse(parsed.scheme, f"Expected local image: {src}")
            self.assertTrue((ROOT / src.lstrip("/")).is_file(), src)

    def test_local_navigation_targets_exist(self) -> None:
        for href in self.parser.links:
            if href.startswith("#"):
                self.assertIn(href[1:], self.parser.ids, href)
            elif href.startswith("/") and not href.startswith("//"):
                target = ROOT / href.lstrip("/")
                self.assertTrue(target.is_file() or target.is_dir(), href)

    def test_legacy_unverified_experience_copy_is_absent(self) -> None:
        blocked_phrases = {
            "employee of the month",
            "wealth management intern",
            "my security",
            "colight asset management",
            "eagleland",
        }
        lower = self.html.lower()
        for phrase in blocked_phrases:
            self.assertNotIn(phrase, lower)

    def test_supporting_web_files_exist(self) -> None:
        for relative in {
            "styles.css",
            "script.js",
            "robots.txt",
            "sitemap.xml",
            "site.webmanifest",
            "404.html",
            "assets/favicon.svg",
            "assets/og-card.png",
            "LICENSE",
        }:
            self.assertTrue((ROOT / relative).is_file(), relative)

    def test_no_placeholder_copy_or_dead_hash_links(self) -> None:
        self.assertNotRegex(self.html.lower(), r"\b(todo|lorem ipsum|coming soon)\b")
        self.assertNotIn('href="#"', self.html)

    def test_documents_use_valid_doctype_and_escape_ampersands(self) -> None:
        raw_ampersand = re.compile(r"&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)")
        for relative in ("index.html", "404.html"):
            document = (ROOT / relative).read_text(encoding="utf-8")
            self.assertTrue(document.startswith("<!DOCTYPE html>"), relative)
            self.assertNotRegex(document, raw_ampersand, relative)

    def test_nested_404_routes_keep_root_assets(self) -> None:
        not_found = (ROOT / "404.html").read_text(encoding="utf-8")
        self.assertIn('href="/styles.css"', not_found)
        self.assertIn('href="/assets/favicon.svg"', not_found)
        self.assertIn('href="/"', not_found)

    def test_structured_data_is_valid_public_identity_json(self) -> None:
        match = re.search(
            r'<script type="application/ld\+json">\s*(.*?)\s*</script>',
            self.html,
            re.DOTALL,
        )
        if match is None:
            self.fail("Missing JSON-LD Person metadata")
        data = json.loads(match.group(1))
        self.assertEqual(data["@context"], "https://schema.org")
        self.assertEqual(data["@type"], "Person")
        self.assertEqual(data["name"], "Oscar Zhu")
        self.assertEqual(data["url"], SITE_URL)
        self.assertIn("https://github.com/zhuhroscar-tech", data["sameAs"])
        self.assertIn("https://www.linkedin.com/in/huairuizhu/", data["sameAs"])
        self.assertEqual(data["affiliation"]["name"], "Washington University in St. Louis")

    def test_manifest_and_sitemap_match_published_site_url(self) -> None:
        manifest = json.loads((ROOT / "site.webmanifest").read_text(encoding="utf-8"))
        self.assertEqual(manifest["name"], "Oscar Zhu — Portfolio")
        self.assertEqual(manifest["start_url"], "/")
        self.assertEqual(manifest["theme_color"], "#0b0b0c")
        icon_paths = {icon["src"] for icon in manifest.get("icons", [])}
        self.assertIn("assets/favicon.svg", icon_paths)
        for icon_path in icon_paths:
            self.assertTrue((ROOT / icon_path).is_file(), icon_path)

        sitemap = ET.parse(ROOT / "sitemap.xml")
        namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        locations = [node.text for node in sitemap.findall(".//sm:loc", namespace)]
        self.assertEqual(locations, [SITE_URL])

        robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
        self.assertIn(f"Sitemap: {SITE_URL}sitemap.xml", robots)

    def test_wordmark_accessible_names_include_visible_text(self) -> None:
        wordmarks = [
            anchor for anchor in self.parser.anchors
            if "wordmark" in str(anchor["attrs"].get("class", "")).split()
        ]
        self.assertEqual(len(wordmarks), 2)
        for anchor in wordmarks:
            visible = " ".join(str(anchor["text"]).split())
            accessible = str(anchor["attrs"].get("aria-label", visible))
            self.assertIn(visible.casefold(), accessible.casefold())

    def test_small_text_colors_meet_wcag_aa(self) -> None:
        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        pairs = {
            ".status-label": "#18181b",
            ".hero-status dt": "#18181b",
            "footer": "#f5f5f7",
        }
        for selector, background in pairs.items():
            foreground = selector_color(css, selector)
            self.assertGreaterEqual(
                contrast_ratio(foreground, background),
                4.5,
                f"{selector}: {foreground} on {background}",
            )


if __name__ == "__main__":
    unittest.main()
