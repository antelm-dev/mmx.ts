# Third-Party Licenses and Notices

This project is a TypeScript port of portions of **Mega Man X8 16-bit** and
includes code, data, artwork, audio, and other material derived from or copied
from that project. Those portions are not covered by any license grant made for
this project's original code. They remain subject to the terms and ownership
notices below.

## Mega Man X8 16-bit

- Project: Mega Man X8 16-bit
- Author: Alysson da Paz and contributors
- Source: <https://github.com/AlyssonDaPaz/Mega-Man-X8-16-bit>
- Copyright: Copyright (c) 2024 Alysson da Paz

The upstream license applies to the ported and derived portions of this
repository, including gameplay implementations and imported resource material:

> X8 16-bit is free to use, modify, and distribute, but not to be used for
> monetization in any way, including but not limited to accepting donations,
> memberships, subscriptions, ad revenues, Patreon support, Ko-fi, or similar
> venues. This prohibition also extends to any team members working on any
> project that uses this code or part of it.
>
> Any derivative works must not be named in a way that could mislead users into
> believing it is the original X8 16-bit or an extended or enhanced version of
> it. Do not use names such as "Definitive", "Enhanced", "Extended", "Plus", or
> similar. Instead, use a naming convention that makes it clear that it is
> another version. For example: "X8 16-bit: Vile's Revenge", "X8 16-bit: L's
> Edition" or something similar.
>
> Alysson da Paz's signature and the entirety of the credits must be included in
> any derivative works. Any derivative works must follow the same rules and
> disclose their code to the public as to encourage further fan projects based
> on X8 16-bit. The above copyright notice and this permission notice shall be
> included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

The authoritative upstream text is available in the
[upstream LICENSE.md](https://github.com/AlyssonDaPaz/Mega-Man-X8-16-bit/blob/main/LICENSE.md).

### Upstream credits

- Alysson da Paz — Developer, Pixel Art, Sound Mixing
- LuizMiguel — Consulting and Quality Assurance
- Roberto Carlos Martinez Escudero — Spanish Localization
- Samuel "Streg" Oliveira — Mega Man 1 Boss Battle Remix
- LuizMiguel, Medivelion, FadinTV, Megamanx_Zero, Shinobi_Speedruns,
  Koalacwb64, Vhevert, JandersonSilvaJS, SilverZ — Playtesting
- HeaxDePolo, ZafersanToksoz, QuartoDoDu, KaneTV, JulinhoRockman, itzBruHere,
  OlimTR, CalebHart42, Nostalgia_Games_BR, Meruziin, Fubadas, BadGokuH,
  Fixxer0, Bacaxi15, Xopa, MazaKoopa, Orlandobrx, LuizTeles, Zekinoma — Special
  Thanks

The upstream project may contain more granular credits in its source tree. When
redistributing this project, retain this notice and any attribution embedded in
the imported resources.

## Capcom material

Mega Man, Mega Man X, Rockman, their characters, names, logos, audiovisual
material, and related intellectual property are owned by or licensed to Capcom.
This is an unofficial fan project and is not affiliated with, authorized by,
endorsed by, or sponsored by Capcom.

The upstream license above grants rights only to material its copyright holders
are entitled to license. It does not grant rights in Capcom trademarks or other
Capcom-owned material. No additional license to that material is claimed or
granted by this repository.

## Bundled game resources

Imported or derived resources are stored under `resources/`, including player,
enemy, effect, pickup, and HUD graphics; animation metadata; and game audio.
Unless a resource is accompanied by a more specific notice, treat it as subject
to the upstream terms and any rights held by Capcom or another identified
creator.

`resources/fonts/mega-man-x.ttf` has no accompanying license or attribution file
in this repository. Its provenance and redistribution terms should be verified
before public distribution. Its presence here must not be interpreted as a
license grant.

## Software dependencies

Third-party JavaScript, Rust, and native dependencies are not relicensed by this
project. Each remains subject to its own license and notices. The applicable
dependency versions are recorded in `pnpm-lock.yaml` and
`apps/desktop/src-tauri/Cargo.lock`; packaged distributions should preserve any
notices required by those dependencies.

