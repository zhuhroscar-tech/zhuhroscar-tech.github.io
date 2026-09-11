# Oscar Zhu — portfolio

![zhuhroscar-tech.github.io homepage](docs/images/homepage.png)

Source for [zhuhroscar-tech.github.io](https://zhuhroscar-tech.github.io/), a static portfolio focused on verified public software.

## Local preview

```bash
python3 -m http.server 8000
```

Open <http://localhost:8000>.

## Validation

```bash
python3 -m unittest discover -s tests -v
```

The checks verify identity and search metadata, required sections, project links, local image assets and alt text, navigation targets, supporting web files, and the absence of legacy unverified experience copy.

## Content policy

The site links only to public projects and approved public profiles. Private work artifacts, internal analyses, transcripts, and application evidence do not belong in this repository.
